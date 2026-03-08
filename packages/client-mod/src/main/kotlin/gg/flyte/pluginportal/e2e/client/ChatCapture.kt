package gg.flyte.pluginportal.e2e.client

import net.minecraft.text.ClickEvent
import net.minecraft.text.Style
import net.minecraft.text.Text
import java.util.concurrent.CopyOnWriteArrayList

object ChatCapture {
    data class ChatEntry(
        val sequence: Long,
        val raw: Text,
        val plain: String
    )

    private val entries = CopyOnWriteArrayList<ChatEntry>()
    @Volatile
    private var nextSequence = 0L

    fun record(message: Text) {
        val sequence = ++nextSequence
        entries += ChatEntry(sequence, message.copy(), message.string)
        if (entries.size > 250) {
            entries.removeFirst()
        }
    }

    fun snapshotSequence(): Long = nextSequence

    fun waitForText(target: String, timeoutMs: Long): ChatEntry? {
        val lowerTarget = target.lowercase()
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            val match = entries.lastOrNull { it.plain.lowercase().contains(lowerTarget) }
            if (match != null) return match
            Thread.sleep(50)
        }
        return null
    }

    fun findLatestClick(target: String): ClickTarget? {
        val lowerTarget = target.lowercase()
        for (entry in entries.asReversed()) {
            val candidate = entry.raw.getWithStyle(Style.EMPTY)
                .lastOrNull { segment ->
                    segment.string.lowercase().contains(lowerTarget) && segment.style.clickEvent != null
                }
            if (candidate != null) {
                return ClickTarget(candidate.string, candidate.style.clickEvent!!)
            }
        }
        return null
    }

    data class ClickTarget(
        val text: String,
        val clickEvent: ClickEvent
    )
}
