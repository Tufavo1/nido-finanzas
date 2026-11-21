# Copyright (c) 2026 Dinovance
# Contenedor de compilacion Android de nido-mobile (reproducible).
# - Base oficial con version fija. NO contiene JDK, Gradle ni Android SDK ni licencias:
#   JDK 21, Gradle y SDK se montan desde el host en solo lectura (ver docker-compose.mobile.yml).
# - Corre como uid 1000 (usuario "node" de la imagen) para no dejar archivos de root.
FROM node:22.12.0-bookworm

ENV JAVA_HOME=/opt/jdk \
    GRADLE_HOME=/opt/gradle \
    ANDROID_HOME=/opt/android-sdk \
    ANDROID_SDK_ROOT=/opt/android-sdk \
    GRADLE_USER_HOME=/home/node/.gradle \
    npm_config_cache=/home/node/.npm \
    npm_config_update_notifier=false \
    CI=true
ENV PATH=/opt/jdk/bin:/opt/gradle/bin:/opt/android-sdk/cmdline-tools/latest/bin:/opt/android-sdk/platform-tools:${PATH}

# Puntos de montaje y cachés con propietario uid 1000 (los volumenes con nombre heredan esto).
RUN mkdir -p /opt/jdk /opt/gradle /opt/android-sdk /work /signing \
             /home/node/.gradle /home/node/.npm \
    && chown -R 1000:1000 /home/node /work

USER 1000:1000
WORKDIR /work
CMD ["bash"]
