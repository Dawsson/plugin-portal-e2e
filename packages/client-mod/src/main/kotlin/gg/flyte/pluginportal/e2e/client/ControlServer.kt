package gg.flyte.pluginportal.e2e.client

import com.google.gson.Gson
import net.minecraft.client.MinecraftClient
import net.minecraft.client.gui.screen.TitleScreen
import net.minecraft.client.gui.screen.multiplayer.ConnectScreen
import net.minecraft.client.network.CookieStorage
import net.minecraft.client.network.ServerAddress
import net.minecraft.client.network.ServerInfo
import net.minecraft.client.util.ScreenshotRecorder
import net.minecraft.SharedConstants
import net.minecraft.text.ClickEvent
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class ControlServer(
    private val port: Int = Integer.getInteger("pluginPortalE2E.port", 44712)
) {
    private val gson = Gson()
    private val executor = Executors.newCachedThreadPool()

    fun start() {
        executor.submit {
            runCatching {
                ServerSocket(port).use { server ->
                    PluginPortalE2EClient.logger.info("Control server listening on {}", port)
                    while (true) {
                        handle(server.accept())
                    }
                }
            }.onFailure {
                PluginPortalE2EClient.logger.error("Control server crashed", it)
            }
        }
    }

    private fun handle(socket: Socket) {
        executor.submit {
            socket.use { client ->
                val reader = BufferedReader(InputStreamReader(client.getInputStream()))
                val writer = OutputStreamWriter(client.getOutputStream())
                val line = reader.readLine() ?: return@use
                val request = gson.fromJson(line, ControlRequest::class.java)
                val response = when (request.action) {
                    "ping" -> ping(request)
                    "connect" -> connect(request)
                    "runCommand" -> runCommand(request)
                    "takeScreenshot" -> takeScreenshot(request)
                    "waitForChat" -> waitForChat(request)
                    "clickChat" -> clickChat(request)
                    else -> unsupported(request, "Unknown action: ${request.action}")
                }
                writer.write(gson.toJson(response))
                writer.write("\n")
                writer.flush()
            }
        }
    }

    private fun ping(request: ControlRequest): ControlResponse {
        val client = MinecraftClient.getInstance()
        return ControlResponse(
            id = request.id,
            ok = true,
            message = "pong",
            result = mapOf(
                "minecraftVersion" to SharedConstants.getGameVersion().name,
                "playerPresent" to (client.player != null).toString(),
                "worldLoaded" to (client.world != null).toString()
            )
        )
    }

    private fun runCommand(request: ControlRequest): ControlResponse {
        val command = request.command ?: return ControlResponse(
            id = request.id,
            ok = false,
            message = "Missing command"
        )

        val client = MinecraftClient.getInstance()
        client.execute {
            val player = client.player ?: return@execute
            val networkHandler = client.networkHandler ?: return@execute
            if (command.startsWith("/")) {
                networkHandler.sendChatCommand(command.removePrefix("/"))
            } else {
                networkHandler.sendChatMessage(command)
            }
            PluginPortalE2EClient.logger.info("Dispatched command {}", command)
        }

        return ControlResponse(
            id = request.id,
            ok = true,
            message = "Command dispatched",
            result = mapOf("command" to command)
        )
    }

    private fun connect(request: ControlRequest): ControlResponse {
        val addressValue = request.address ?: return ControlResponse(
            id = request.id,
            ok = false,
            message = "Missing server address"
        )

        val future = CompletableFuture<ControlResponse>()
        val client = MinecraftClient.getInstance()
        client.execute {
            val address = ServerAddress.parse(addressValue)
            val serverInfo = ServerInfo("Plugin Portal E2E", addressValue, ServerInfo.ServerType.OTHER)
            ConnectScreen.connect(
                TitleScreen(),
                client,
                address,
                serverInfo,
                false,
                CookieStorage(emptyMap())
            )
            PluginPortalE2EClient.logger.info("Connecting to {}", addressValue)
            future.complete(
                ControlResponse(
                    id = request.id,
                    ok = true,
                    message = "Connection started",
                    result = mapOf("address" to addressValue)
                )
            )
        }
        return future.get(10, TimeUnit.SECONDS)
    }

    private fun takeScreenshot(request: ControlRequest): ControlResponse {
        val outputDir = request.path ?: return ControlResponse(
            id = request.id,
            ok = false,
            message = "Missing screenshot path"
        )
        val screenshotName = (request.name ?: "plugin-portal-e2e").removeSuffix(".png")
        val directory = File(outputDir)
        directory.mkdirs()
        val screenshotFile = File(directory, "$screenshotName.png")
        val future = CompletableFuture<ControlResponse>()
        val client = MinecraftClient.getInstance()
        client.execute {
            ScreenshotRecorder.saveScreenshot(directory, screenshotName, client.framebuffer) { _ ->
                future.complete(
                    ControlResponse(
                        id = request.id,
                        ok = true,
                        message = "Screenshot saved",
                        result = mapOf("path" to screenshotFile.absolutePath)
                    )
                )
            }
        }
        return future.get(10, TimeUnit.SECONDS)
    }

    private fun waitForChat(request: ControlRequest): ControlResponse {
        val target = request.text ?: return ControlResponse(
            id = request.id,
            ok = false,
            message = "Missing chat text"
        )
        val timeoutMs = request.timeoutMs ?: 5_000L
        val match = ChatCapture.waitForText(target, timeoutMs)
        return if (match != null) {
            ControlResponse(
                id = request.id,
                ok = true,
                message = "Matched chat text",
                result = mapOf("text" to match.plain)
            )
        } else {
            ControlResponse(
                id = request.id,
                ok = false,
                message = "Timed out waiting for chat text: $target"
            )
        }
    }

    private fun clickChat(request: ControlRequest): ControlResponse {
        val target = request.text ?: return ControlResponse(
            id = request.id,
            ok = false,
            message = "Missing click target text"
        )
        val clickTarget = ChatCapture.findLatestClick(target) ?: return ControlResponse(
            id = request.id,
            ok = false,
            message = "No clickable chat component matched: $target"
        )

        val client = MinecraftClient.getInstance()
        val clickEvent = clickTarget.clickEvent
        client.execute {
            when (clickEvent.action) {
                ClickEvent.Action.RUN_COMMAND,
                ClickEvent.Action.SUGGEST_COMMAND -> {
                    val networkHandler = client.networkHandler ?: return@execute
                    val command = clickEvent.value.removePrefix("/")
                    networkHandler.sendChatCommand(command)
                }
                else -> PluginPortalE2EClient.logger.warn("Unsupported click action {}", clickEvent.action)
            }
        }

        return ControlResponse(
            id = request.id,
            ok = clickEvent.action == ClickEvent.Action.RUN_COMMAND || clickEvent.action == ClickEvent.Action.SUGGEST_COMMAND,
            message = "Click event dispatched",
            result = mapOf(
                "text" to clickTarget.text,
                "action" to clickEvent.action.name,
                "value" to clickEvent.value
            )
        )
    }

    private fun unsupported(request: ControlRequest, message: String): ControlResponse {
        return ControlResponse(
            id = request.id,
            ok = false,
            message = message
        )
    }
}
