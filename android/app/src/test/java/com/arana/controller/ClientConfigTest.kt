package com.arana.controller

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The HiveMQ client must actually carry the parsed endpoint (no broker needed). */
class ClientConfigTest {
    private fun cfg(url: String) =
        LinkManager(clock = { 0L }).buildClient(BrokerUrl.parse(url)!!).config.transportConfig

    @Test
    fun wssCarriesHostPortPathAndTls() {
        val t = cfg("wss://mqtt.t420.dev/mqtt")
        assertEquals("mqtt.t420.dev", t.serverAddress.hostString)
        assertEquals(443, t.serverAddress.port)
        assertNotNull(t.webSocketConfig.orElse(null))
        assertEquals("mqtt", t.webSocketConfig.get().serverPath)
        assertTrue(t.sslConfig.isPresent)
    }

    @Test
    fun wsHasNoTls() {
        val t = cfg("ws://192.168.1.79:9001/mqtt")
        assertEquals(9001, t.serverAddress.port)
        assertTrue(t.webSocketConfig.isPresent)
        assertFalse(t.sslConfig.isPresent)
    }

    @Test
    fun tcpHasNeitherWebSocketNorTls() {
        val t = cfg("tcp://100.66.97.18:1883")
        assertEquals(1883, t.serverAddress.port)
        assertFalse(t.webSocketConfig.isPresent)
        assertFalse(t.sslConfig.isPresent)
        assertNull(t.webSocketConfig.orElse(null))
    }

    @Test
    fun timeoutsAreApplied() {
        val t = cfg("tcp://h:1883")
        assertEquals(10_000, t.socketConnectTimeoutMs)
        assertEquals(10_000, t.mqttConnectTimeoutMs)
    }
}
