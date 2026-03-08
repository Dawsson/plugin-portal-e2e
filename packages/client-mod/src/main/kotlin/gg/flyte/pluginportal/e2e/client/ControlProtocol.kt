package gg.flyte.pluginportal.e2e.client

data class ControlRequest(
    val id: String? = null,
    val action: String,
    val command: String? = null,
    val address: String? = null,
    val name: String? = null,
    val text: String? = null,
    val path: String? = null,
    val timeoutMs: Long? = null,
    val delayMs: Long? = null,
    val openChat: Boolean? = null
)

data class ControlResponse(
    val id: String? = null,
    val ok: Boolean,
    val message: String,
    val result: Map<String, String> = emptyMap()
)
