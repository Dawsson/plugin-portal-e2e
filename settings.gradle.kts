pluginManagement {
  repositories {
    gradlePluginPortal()
    maven("https://maven.fabricmc.net/")
    mavenCentral()
  }
}

rootProject.name = "plugin-portal-e2e"

include(":packages:client-mod")
project(":packages:client-mod").projectDir = file("packages/client-mod")

