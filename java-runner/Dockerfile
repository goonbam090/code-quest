FROM eclipse-temurin:21-jdk-alpine@sha256:1ff763083f2993d57d0bf374ab10bb3e2cb873af6c13a04458ebbd3e0337dc76

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
