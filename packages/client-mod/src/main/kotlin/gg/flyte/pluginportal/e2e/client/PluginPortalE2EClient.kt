package gg.flyte.pluginportal.e2e.client

import net.fabricmc.api.ClientModInitializer
import org.slf4j.LoggerFactory

object PluginPortalE2EClient : ClientModInitializer {
    val logger = LoggerFactory.getLogger("plugin-portal-e2e-client")
    private lateinit var controlServer: ControlServer

    override fun onInitializeClient() {
        controlServer = ControlServer()
        controlServer.start()
        logger.info("Plugin Portal E2E client initialized")
    }
}

