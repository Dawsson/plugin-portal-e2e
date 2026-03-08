package gg.flyte.pluginportal.e2e.client

import com.google.gson.Gson
import net.minecraft.client.MinecraftClient
import net.minecraft.SharedConstants
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.Executors

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
                    "runCommand" -> runCommand(request)
                    "takeScreenshot" -> unsupported(request, "Screenshot capture is not implemented yet")
                    "waitForChat" -> unsupported(request, "Chat matching is not implemented yet")
                    "clickChat" -> unsupported(request, "Clickable chat automation is not implemented yet")
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

    private fun unsupported(request: ControlRequest, message: String): ControlResponse {
        return ControlResponse(
            id = request.id,
            ok = false,
            message = message
        )
    }
}
