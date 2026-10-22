package com.arana.controller

/** MQTT endpoint parsed from the login "Server URL" field. Pure Kotlin, no Android types. */
data class BrokerUrl(
    /** tcp | ssl | ws | wss. */
    val scheme: String,
    val host: String,
    val port: Int,
    /** "/mqtt" style path for ws/wss, empty for tcp/ssl. */
    val path: String,
) {
    val isTls: Boolean get() = scheme == "ssl" || scheme == "wss"
    val isWebSocket: Boolean get() = scheme == "ws" || scheme == "wss"

    /** Canonical text with the port always explicit. Never contains credentials. */
    fun display(): String {
        val h = if (host.contains(':')) "[$host]" else host
        return "$scheme://$h:$port$path"
    }

    companion object {
        const val DEFAULT_WS_PATH = "/mqtt"
        private val DEFAULT_PORTS = mapOf("tcp" to 1883, "ssl" to 8883, "ws" to 80, "wss" to 443)
        private val SHAPE = Regex("^([A-Za-z][A-Za-z0-9+.-]*)://([^/?#]*)([^?#]*)")

        /** Returns null for anything that is not a usable broker endpoint. */
        fun parse(raw: String): BrokerUrl? {
            val m = SHAPE.find(raw.trim()) ?: return null
            val scheme = m.groupValues[1].lowercase()
            val defaultPort = DEFAULT_PORTS[scheme] ?: return null
            val authority = m.groupValues[2]
            if (authority.isEmpty() || authority.contains('@')) return null

            val host: String
            var port = defaultPort
            if (authority.startsWith("[")) {
                val end = authority.indexOf(']')
                if (end < 2) return null
                host = authority.substring(1, end)
                val rest = authority.substring(end + 1)
                if (rest.isNotEmpty()) port = parsePort(rest) ?: return null
            } else {
                val colon = authority.lastIndexOf(':')
                if (colon >= 0) {
                    host = authority.substring(0, colon)
                    port = parsePort(authority.substring(colon)) ?: return null
                } else {
                    host = authority
                }
            }
            if (host.isEmpty() || host.any { it.isWhitespace() }) return null

            val rawPath = m.groupValues[3]
            val path = when {
                scheme == "ws" || scheme == "wss" -> if (rawPath.isEmpty() || rawPath == "/") DEFAULT_WS_PATH else rawPath
                else -> ""
            }
            return BrokerUrl(scheme, host, port, path)
        }

        /** [colonPort] starts with ':'. */
        private fun parsePort(colonPort: String): Int? {
            if (!colonPort.startsWith(":")) return null
            val digits = colonPort.substring(1)
            if (digits.isEmpty() || !digits.all { it in '0'..'9' } || digits.length > 5) return null
            return digits.toInt().takeIf { it in 1..65535 }
        }
    }
}
