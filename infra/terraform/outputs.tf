output "alb_dns_name" {
  value       = aws_lb.main.dns_name
  description = "Open http://<this> in a browser"
}

output "ecr_registry" {
  value       = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"
  description = "Set as ECR_REGISTRY / used by docker login"
}

output "ecr_backend_repo" {
  value = aws_ecr_repository.app["backend"].repository_url
}

output "ecr_frontend_repo" {
  value = aws_ecr_repository.app["frontend"].repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "jenkins_iam_user" {
  value       = aws_iam_user.jenkins.name
  description = "Create an access key for this user and store it in Jenkins as 'aws-jenkins'"
}

output "nat_public_ips" {
  value       = module.vpc.nat_public_ips
  description = "Outbound IP of the containers - allow-list this in MongoDB Atlas > Network Access"
}
