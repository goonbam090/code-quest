FROM maven:3.9.9-eclipse-temurin-21@sha256:3a4ab3276a087bf276f79cae96b1af04f53731bec53fb2e651aca79e4b10211e AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline
COPY src src
RUN mvn -q package

FROM eclipse-temurin:25-jre-alpine@sha256:28db6fdf60e38945e43d840c0333aeaec66c15943070104f7586fd3c9d1665b0
WORKDIR /app
COPY --from=build /app/target/code-quest-api-1.0.0.jar app.jar
RUN addgroup -S codequest && adduser -S -G codequest -u 10001 codequest
USER codequest
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
