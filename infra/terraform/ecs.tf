resource "aws_ssm_parameter" "mongodb_uri" {
  name  = "/${var.project}/${var.environment}/MONGO_URI"
  type  = "SecureString"
  value = var.mongodb_uri
}

resource "aws_cloudwatch_log_group" "app" {
  for_each          = toset(["backend", "frontend"])
  name              = "/ecs/${var.project}/${each.key}"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-cluster"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

locals {
  components = {
    backend = {
      port   = 5000
      cpu    = var.backend_cpu
      memory = var.backend_memory
      env = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "5000" },
        { name = "APP_VERSION", value = "bootstrap" }
      ]
      secrets = [{ name = "MONGO_URI", valueFrom = aws_ssm_parameter.mongodb_uri.arn }]
    }
    frontend = {
      port    = 80
      cpu     = var.frontend_cpu
      memory  = var.frontend_memory
      env     = [{ name = "APP_VERSION", value = "bootstrap" }]
      secrets = []
    }
  }

  # blue and green services share the same task-definition family
  services = {
    "backend-blue"   = { component = "backend" }
    "backend-green"  = { component = "backend" }
    "frontend-blue"  = { component = "frontend" }
    "frontend-green" = { component = "frontend" }
  }
}

# Bootstrap task definitions. The pipeline registers new revisions with the real image tag.
resource "aws_ecs_task_definition" "app" {
  for_each                 = local.components
  family                   = "${var.project}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([{
    name         = each.key
    image        = "${aws_ecr_repository.app[each.key].repository_url}:bootstrap"
    essential    = true
    portMappings = [{ containerPort = each.value.port, protocol = "tcp" }]
    environment  = each.value.env
    secrets      = each.value.secrets
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.app[each.key].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = each.key
      }
    }
  }])
}

# desired_count starts at 0: the first pipeline run brings up the first color.
resource "aws_ecs_service" "this" {
  for_each                          = local.services
  name                              = "${var.project}-${each.key}"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.app[each.value.component].arn
  desired_count                     = 0
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 30
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.this[each.key].arn
    container_name   = each.value.component
    container_port   = local.components[each.value.component].port
  }

  # The pipeline owns the image version and the running count
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener.http, aws_lb_listener_rule.backend]
}
