data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

# Execution role: pulls images, writes logs, reads the Mongo secret
resource "aws_iam_role" "task_execution" {
  name               = "${var.project}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "read_secrets" {
  name = "read-ssm-secrets"
  role = aws_iam_role.task_execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["ssm:GetParameters", "ssm:GetParameter"]
      Resource = [aws_ssm_parameter.mongodb_uri.arn]
    }]
  })
}

# Task role: what the application code itself may do in AWS (nothing yet)
resource "aws_iam_role" "task" {
  name               = "${var.project}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

# ---------- least-privilege policy for the Jenkins pipeline ----------
resource "aws_iam_policy" "jenkins_deploy" {
  name        = "${var.project}-jenkins-deploy"
  description = "Lets Jenkins push images and run blue-green / canary deployments"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EcrLogin"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "EcrPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:DescribeImages",
          "ecr:GetDownloadUrlForLayer"
        ]
        Resource = [for r in aws_ecr_repository.app : r.arn]
      },
      {
        Sid    = "EcsDeploy"
        Effect = "Allow"
        Action = [
          "ecs:DescribeServices", "ecs:UpdateService", "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition", "ecs:ListTasks", "ecs:DescribeTasks"
        ]
        Resource = "*"
      },
      {
        Sid    = "AlbTrafficShift"
        Effect = "Allow"
        Action = [
          "elasticloadbalancing:Describe*", "elasticloadbalancing:ModifyRule",
          "elasticloadbalancing:ModifyListener"
        ]
        Resource = "*"
      },
      {
        Sid      = "CanaryMetrics"
        Effect   = "Allow"
        Action   = ["cloudwatch:GetMetricStatistics"]
        Resource = "*"
      },
      {
        Sid      = "PassRolesToEcs"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.task_execution.arn, aws_iam_role.task.arn]
      }
    ]
  })
}

resource "aws_iam_user" "jenkins" {
  name = "${var.project}-jenkins"
}

resource "aws_iam_user_policy_attachment" "jenkins" {
  user       = aws_iam_user.jenkins.name
  policy_arn = aws_iam_policy.jenkins_deploy.arn
}
