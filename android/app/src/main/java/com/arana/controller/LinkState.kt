package com.arana.controller

sealed interface LinkState {
    data object Disconnected : LinkState
    data object Connecting : LinkState
    data object Connected : LinkState
    data class Reconnecting(val reason: String?) : LinkState
    data class Failed(val message: String) : LinkState
}

enum class Direction { TX, RX, SYS }

/** One line of the packet log. [unconfirmed] marks commands sent without a live body telemetry. */
data class PacketLogEntry(
    val atMs: Long,
    val direction: Direction,
    val topic: String,
    val json: String,
    val unconfirmed: Boolean = false,
)
