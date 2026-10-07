# Four target groups: {backend,frontend} x {blue,green}
locals {
  target_groups = {
    "backend-blue"   = { port = 5000, health_path = "/api/health" }
    "backend-green"  = { port = 5000, health_path = "/api/health" }
    "frontend-blue"  = { port = 80, health_path = "/health" }
    "frontend-green" = { port = 80, health_path = "/health" }
  }
}

resource "aws_lb" "main" {
  name               = "${var.project}-alb"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets
  idle_timeout       = 60
}

resource "aws_lb_target_group" "this" {
  for_each             = local.target_groups
  name                 = "${var.project}-${each.key}"
  port                 = each.value.port
  protocol             = "HTTP"
  target_type          = "ip" # required for Fargate (awsvpc)
  vpc_id               = module.vpc.vpc_id
  deregistration_delay = 30

  health_check {
    path                = each.value.health_path
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# Default action -> frontend. Weights: 100% blue / 0% green at first.
# The deployment scripts change these weights, so Terraform must not revert them.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.this["frontend-blue"].arn
        weight = 100
      }
      target_group {
        arn    = aws_lb_target_group.this["frontend-green"].arn
        weight = 0
      }
    }
  }

  lifecycle {
    ignore_changes = [default_action]
  }
}

# /api/* -> backend (priority 10 is what scripts/lib.sh looks up)
resource "aws_lb_listener_rule" "backend" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.this["backend-blue"].arn
        weight = 100
      }
      target_group {
        arn    = aws_lb_target_group.this["backend-green"].arn
        weight = 0
      }
    }
  }

  condition {
    path_pattern {
      values = ["/api/*"]
    }
  }

  lifecycle {
    ignore_changes = [action]
  }
}
