FROM eclipse-temurin:25-jdk-alpine@sha256:5ecfde8e5ecde5954ea3721155b345ef56c1d579b940c761318ad4c05959a151

WORKDIR /app
COPY src/*.java .
RUN javac JavaRunnerServer.java SourceContractChecker.java JavaRunnerServerTest.java \
    && java -ea JavaRunnerServerTest \
    && rm -f JavaRunnerServerTest.java JavaRunnerServerTest.class \
    && addgroup -S quest \
    && adduser -S -G quest -u 10001 quest

USER quest
ENV PORT=3002
EXPOSE 3002
ENTRYPOINT ["java", "-Xms16m", "-Xmx48m", "-XX:MaxMetaspaceSize=32m", "-XX:MaxDirectMemorySize=8m", "-XX:ActiveProcessorCount=1", "JavaRunnerServer"]
