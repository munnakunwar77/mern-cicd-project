variable "aws_region" {
  type        = string
  default     = "ap-south-1"
  description = "AWS region to deploy into"
}

variable "project" {
  type        = string
  default     = "mern-cicd"
  description = "Name prefix for every resource. Must match PROJECT in the Jenkinsfile (scripts find resources by this prefix)."
}

variable "environment" {
  type    = string
  default = "prod"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "mongodb_uri" {
  type        = string
  sensitive   = true
  description = "MongoDB connection string, e.g. your MongoDB Atlas URI. Stored as an SSM SecureString and injected into the backend task."
}

variable "backend_cpu" {
  type    = number
  default = 256
}

variable "backend_memory" {
  type    = number
  default = 512
}

variable "frontend_cpu" {
  type    = number
  default = 256
}

variable "frontend_memory" {
  type    = number
  default = 512
}

variable "log_retention_days" {
  type    = number
  default = 14
}
