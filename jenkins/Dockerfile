FROM jenkins/jenkins:lts-jdk17

USER root

# Install Node.js 20
RUN apt-get update \
     && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
     && mkdir -p /etc/apt/keyrings \
     && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
     | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
     && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
     > /etc/apt/sources.list.d/nodesource.list \
     && apt-get update \
     && apt-get install -y --no-install-recommends nodejs \
     && node --version \
     && npm --version \
     && rm -rf /var/lib/apt/lists/*

# Tooling the pipeline needs on the agent: Docker CLI, AWS CLI v2, jq, curl, Trivy
RUN apt-get update && apt-get install -y --no-install-recommends \
     ca-certificates curl gnupg jq unzip lsb-release \
     && install -m 0755 -d /etc/apt/keyrings \
     && curl -fsSL https://download.docker.com/linux/debian/gpg \
     -o /etc/apt/keyrings/docker.asc \
     && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
     > /etc/apt/sources.list.d/docker.list \
     && apt-get update \
     && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin \
     && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" \
     -o /tmp/awscli.zip \
     && unzip -q /tmp/awscli.zip -d /tmp \
     && /tmp/aws/install \
     && rm -rf /tmp/aws /tmp/awscli.zip \
     && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh \
     | sh -s -- -b /usr/local/bin \
     && rm -rf /var/lib/apt/lists/*

USER jenkins

COPY plugins.txt /usr/share/jenkins/ref/plugins.txt

RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

# FROM jenkins/jenkins:lts-jdk17
# USER root

# # Tooling the pipeline needs on the agent: docker CLI, AWS CLI v2, jq, curl, Trivy
# RUN apt-get update && apt-get install -y --no-install-recommends \
#       ca-certificates curl gnupg jq unzip lsb-release \
#  && install -m 0755 -d /etc/apt/keyrings \
#  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
#  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
#       > /etc/apt/sources.list.d/docker.list \
#  && apt-get update && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin \
#  && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscli.zip \
#  && unzip -q /tmp/awscli.zip -d /tmp && /tmp/aws/install && rm -rf /tmp/aws /tmp/awscli.zip \
#  && curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin \
#  && rm -rf /var/lib/apt/lists/*

# USER jenkins
# COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
# RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt
