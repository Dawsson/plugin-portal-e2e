package gg.flyte.pluginportal.e2e.client

data class ControlRequest(
    val id: String? = null,
    val action: String,
    val command: String? = null,
    val name: String? = null
)

data class ControlResponse(
    val id: String? = null,
    val ok: Boolean,
    val message: String,
    val result: Map<String, String> = emptyMap()
)

