# SonarQube Community Build for the Bukti CI quality gate, tuned to run on Cloud Run (gen2).
FROM sonarqube:26.10.0.133078-community

# Cloud Run cannot raise vm.max_map_count, so the embedded Elasticsearch must not rely on mmap
# and must skip its production bootstrap checks. The database is reached through the Cloud SQL
# Auth Proxy sidecar on localhost.
ENV SONAR_SEARCH_JAVAADDITIONALOPTS="-Dnode.store.allow_mmap=false" \
    SONAR_ES_BOOTSTRAP_CHECKS_DISABLE="true" \
    SONAR_JDBC_URL="jdbc:postgresql://127.0.0.1:5432/sonarqube" \
    SONAR_JDBC_USERNAME="sonar" \
    SONAR_TELEMETRY_ENABLE="false"

# The official image already runs as the unprivileged sonarqube user; state it explicitly.
USER sonarqube

EXPOSE 9000
