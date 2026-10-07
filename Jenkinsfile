// ============================================================================
//  MERN CI/CD pipeline  -  Jenkins declarative pipeline (multibranch)
//
//  CI  : install -> lint -> unit tests (+coverage) -> SonarQube + quality gate
//        -> dependency audit -> docker build -> Trivy image scan
//  CD  : (main branch only) push to ECR -> approval -> blue-green OR canary
//        deploy to ECS Fargate behind an ALB -> verify -> retire old version
//
//  Jenkins prerequisites (see docs/STEP_BY_STEP_GUIDE.md, Part 5):
//    Tools        : NodeJS "NodeJS-20", SonarQube Scanner "SonarScanner"
//    Sonar server : "sonarqube"  (Manage Jenkins > System)
//    Credentials  : "aws-jenkins" (AWS access key + secret key)
//    On the agent : docker, aws cli v2, jq, curl, trivy  (baked into jenkins/Dockerfile)
// ============================================================================

// Runs a block with AWS credentials + region available to the aws CLI
def withAws(Closure body) {
    withCredentials([[$class: 'AmazonWebServicesCredentialsBinding',
                      credentialsId: 'aws-jenkins',
                      accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                      secretKeyVariable: 'AWS_SECRET_ACCESS_KEY']]) {
        withEnv(["AWS_REGION=${env.AWS_REGION}", "AWS_DEFAULT_REGION=${env.AWS_REGION}"]) {
            body()
        }
    }
}

pipeline {
    agent any

    options {
        timestamps()
        timeout(time: 90, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
        disableConcurrentBuilds()   // two deployments must never race for the same ALB
    }

    parameters {
        choice(name: 'DEPLOY_STRATEGY', choices: ['bluegreen', 'canary', 'none'],
               description: 'How to release on main. "none" = CI only (build, test, push).')
        booleanParam(name: 'REQUIRE_APPROVAL', defaultValue: true,
                     description: 'Ask a human before deploying to production')
        string(name: 'CANARY_STEPS', defaultValue: '10 50 100',
               description: 'Canary only: traffic percentages to step through')
        string(name: 'BAKE_SECONDS', defaultValue: '120',
               description: 'Canary only: observation time at each step')
    }

    // tools {
    //     nodejs 'NodeJS-20'
    // }

    environment {
        AWS_REGION = 'ap-south-1'          // must match terraform var.aws_region
        PROJECT    = 'mern-cicd'           // must match terraform var.project
        CI         = 'true'
    }

    stages {

        stage('Checkout & Init') {
            steps {
                checkout scm
                script {
                    def sha = sh(returnStdout: true, script: 'git rev-parse --short=7 HEAD').trim()
                    env.IMAGE_TAG = "${env.BUILD_NUMBER}-${sha}"
                    currentBuild.displayName = "#${env.BUILD_NUMBER} ${sha}"
                }
                sh 'node --version && npm --version && docker --version'
                echo "Image tag for this build: ${env.IMAGE_TAG}"
            }
        }

        stage('Install Dependencies') {
            parallel {
                stage('Backend')  { steps { dir('backend')  { sh 'npm ci' } } }
                stage('Frontend') { steps { dir('frontend') { sh 'npm ci' } } }
            }
        }

        stage('Lint') {
            parallel {
                stage('Backend ESLint')  { steps { dir('backend')  { sh 'npm run lint' } } }
                stage('Frontend ESLint') { steps { dir('frontend') { sh 'npm run lint' } } }
            }
        }

        stage('Unit Tests') {
            parallel {
                stage('Backend (Jest + MongoDB)') {
                    steps {
                        script {
                            // Real MongoDB in a throw-away container for integration-style API tests
                            def mongo = "mongo-test-${env.BUILD_NUMBER}"
                            sh "docker rm -f ${mongo} || true"
                            sh "docker run -d --name ${mongo} mongo:7"
                            try {
                                sh """
                                  for i in \$(seq 1 30); do
                                    docker exec ${mongo} mongosh --quiet --eval "db.adminCommand('ping')" && break
                                    sleep 2
                                  done
                                """
                                def ip = sh(returnStdout: true, script:
                                    "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${mongo}").trim()
                                dir('backend') {
                                    withEnv(["MONGO_TEST_URI=mongodb://${ip}:27017/ci_test"]) {
                                        sh 'npm test'
                                    }
                                }
                            } finally {
                                sh "docker rm -f ${mongo} || true"
                                junit allowEmptyResults: true, testResults: 'backend/reports/junit.xml'
                            }
                        }
                    }
                }
                stage('Frontend (Vitest)') {
                    steps {
                        dir('frontend') { sh 'npm test' }
                    }
                    post {
                        always { junit allowEmptyResults: true, testResults: 'frontend/reports/junit.xml' }
                    }
                }
            }
        }

        // Community Edition analyses one branch only, so gate main/develop.
        stage('SonarQube Analysis') {
            when { branch pattern: 'main|develop', comparator: 'REGEXP' }
            steps {
                script {
                    // lcov paths are relative to each package; Sonar needs them relative to the repo root
                    sh "sed -i 's#^SF:src/#SF:backend/src/#' backend/coverage/lcov.info"
                    sh "sed -i 's#^SF:src/#SF:frontend/src/#' frontend/coverage/lcov.info"
                    def scannerHome = tool 'SonarScanner'
                    withSonarQubeEnv('SonarQube') {
                        sh "${scannerHome}/bin/sonar-scanner -Dsonar.projectVersion=${env.IMAGE_TAG}"
                    }
                }
            }
        }

        stage('Quality Gate') {
            when { branch pattern: 'main|develop', comparator: 'REGEXP' }
            steps {
                // needs the Sonar webhook: http://<jenkins>/sonarqube-webhook/
                timeout(time: 10, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        stage('Dependency Audit') {
            steps {
                // Marks the build UNSTABLE (yellow) instead of failing it; tighten when ready
                catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
                    dir('backend')  { sh 'npm audit --omit=dev --audit-level=high' }
                    dir('frontend') { sh 'npm audit --omit=dev --audit-level=high' }
                }
            }
        }

        stage('Build Docker Images') {
            parallel {
                stage('Backend image')  { steps { sh "docker build -t ${env.PROJECT}-backend:${env.IMAGE_TAG} backend" } }
                stage('Frontend image') { steps { sh "docker build -t ${env.PROJECT}-frontend:${env.IMAGE_TAG} frontend" } }
            }
        }

        stage('Trivy Image Scan') {
            steps {
                // Fail on CRITICAL vulnerabilities that already have a fix available
                sh """
                  trivy image --no-progress --exit-code 1 --severity CRITICAL --ignore-unfixed ${env.PROJECT}-backend:${env.IMAGE_TAG}
                  trivy image --no-progress --exit-code 1 --severity CRITICAL --ignore-unfixed ${env.PROJECT}-frontend:${env.IMAGE_TAG}
                """
            }
        }

        stage('Push to ECR') {
            when { branch 'main' }
            steps {
                script {
                    withAws {
                        env.ECR_REGISTRY = sh(returnStdout: true, script:
                            'echo "$(aws sts get-caller-identity --query Account --output text).dkr.ecr.${AWS_REGION}.amazonaws.com"').trim()
                        sh 'aws ecr get-login-password | docker login --username AWS --password-stdin "$ECR_REGISTRY"'
                        sh """
                          for c in backend frontend; do
                            docker tag  ${env.PROJECT}-\$c:${env.IMAGE_TAG} ${env.ECR_REGISTRY}/${env.PROJECT}-\$c:${env.IMAGE_TAG}
                            docker push ${env.ECR_REGISTRY}/${env.PROJECT}-\$c:${env.IMAGE_TAG}
                          done
                        """
                    }
                }
            }
        }

        stage('Approve Production Release') {
            when {
                allOf {
                    branch 'main'
                    expression { params.DEPLOY_STRATEGY != 'none' }
                    expression { params.REQUIRE_APPROVAL }
                }
            }
            steps {
                timeout(time: 30, unit: 'MINUTES') {
                    input message: "Release ${env.IMAGE_TAG} to production using ${params.DEPLOY_STRATEGY}?",
                          ok: 'Deploy'
                }
            }
        }

        stage('Deploy to AWS') {
            when {
                allOf {
                    branch 'main'
                    expression { params.DEPLOY_STRATEGY != 'none' }
                }
            }
            steps {
                script {
                    withAws {
                        withEnv(["ECR_REGISTRY=${env.ECR_REGISTRY}",
                                 "CANARY_STEPS=${params.CANARY_STEPS}",
                                 "BAKE_SECONDS=${params.BAKE_SECONDS}"]) {
                            // deploy-bluegreen.sh  or  deploy-canary.sh  (both auto-rollback on failure)
                            sh "./scripts/deploy-${params.DEPLOY_STRATEGY}.sh ${env.IMAGE_TAG}"
                        }
                    }
                }
            }
            post {
                always { archiveArtifacts artifacts: 'deploy-state.env', allowEmptyArchive: true }
            }
        }

        stage('Verify Production') {
            when {
                allOf {
                    branch 'main'
                    expression { params.DEPLOY_STRATEGY != 'none' }
                }
            }
            steps {
                script {
                    withAws {
                        sh '''#!/usr/bin/env bash
                          set -e
                          source scripts/lib.sh
                          scripts/smoke-test.sh "http://$(alb_dns)" "$IMAGE_TAG"
                        '''
                    }
                }
            }
        }

        stage('Retire Previous Version') {
            when {
                allOf {
                    branch 'main'
                    expression { params.DEPLOY_STRATEGY != 'none' }
                    expression { params.REQUIRE_APPROVAL }
                }
            }
            steps {
                script {
                    // Keep the old color running as an instant-rollback standby until a human confirms
                    def proceed = true
                    try {
                        timeout(time: 60, unit: 'MINUTES') {
                            input message: 'Release looks healthy? Scale the previous version down (rollback will still be possible).',
                                  ok: 'Scale down'
                        }
                    } catch (err) {
                        proceed = false
                        echo 'Not confirmed - previous version left running. Run scripts/finalize.sh later.'
                    }
                    if (proceed) {
                        withAws { sh './scripts/finalize.sh' }
                    }
                }
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'backend/coverage/**,frontend/coverage/**', allowEmptyArchive: true
            sh 'docker image prune -f || true'
            cleanWs(deleteDirs: true, notFailBuild: true)
        }
        success { echo "Pipeline succeeded: ${env.IMAGE_TAG}" }
        failure {
            echo 'Pipeline failed. If the failure happened during deploy, the scripts have already restored traffic to the previous version.'
            // emailext to: 'team@example.com', subject: "FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER}", body: "${env.BUILD_URL}"
        }
    }
}
