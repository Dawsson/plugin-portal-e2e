buildscript {
  repositories {
    maven("https://maven.fabricmc.net/")
    mavenCentral()
    gradlePluginPortal()
  }
  dependencies {
    classpath("net.fabricmc:fabric-loom:${project.findProperty("loom_version")}")
  }
}

plugins {
  id("org.jetbrains.kotlin.jvm") version "2.3.10"
}

apply(plugin = "fabric-loom")

base {
  archivesName = property("archives_base_name") as String
}

repositories {
  maven("https://maven.fabricmc.net/")
  mavenCentral()
}

dependencies {
  add("minecraft", "com.mojang:minecraft:${property("minecraft_version")}")
  add("mappings", "net.fabricmc:yarn:${property("yarn_mappings")}:v2")
  add("modImplementation", "net.fabricmc:fabric-loader:${property("loader_version")}")
  add("modImplementation", "net.fabricmc.fabric-api:fabric-api:${property("fabric_version")}")
  add("modImplementation", "net.fabricmc:fabric-language-kotlin:${property("fabric_kotlin_version")}")
}

tasks.processResources {
  inputs.property("version", project.version)
  filesMatching("fabric.mod.json") {
    expand("version" to project.version)
  }
}

tasks.withType<JavaCompile>().configureEach {
  options.release.set(21)
}

kotlin {
  jvmToolchain(21)
}

java {
  sourceCompatibility = JavaVersion.VERSION_21
  targetCompatibility = JavaVersion.VERSION_21
  withSourcesJar()
}
