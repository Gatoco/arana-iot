package com.arana.controller

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class BrokerUrlTest {
    @Test
    fun wssDefaultsToPort443AndMqttPath() {
        assertEquals(BrokerUrl("wss", "mqtt.t420.dev", 443, "/mqtt"), BrokerUrl.parse("wss://mqtt.t420.dev/mqtt"))
        assertEquals(BrokerUrl("wss", "mqtt.t420.dev", 443, "/mqtt"), BrokerUrl.parse("wss://mqtt.t420.dev"))
    }

    @Test
    fun wsExplicitPortAndPath() {
        assertEquals(BrokerUrl("ws", "192.168.1.79", 9001, "/mqtt"), BrokerUrl.parse("ws://192.168.1.79:9001/mqtt"))
        assertEquals(BrokerUrl("ws", "h", 80, "/custom"), BrokerUrl.parse("ws://h/custom"))
    }

    @Test
    fun tcpAndSslHaveNoPath() {
        assertEquals(BrokerUrl("tcp", "100.66.97.18", 1883, ""), BrokerUrl.parse("tcp://100.66.97.18:1883"))
        assertEquals(BrokerUrl("tcp", "h", 1883, ""), BrokerUrl.parse("tcp://h"))
        assertEquals(BrokerUrl("ssl", "host", 8883, ""), BrokerUrl.parse("ssl://host:8883"))
        assertEquals(BrokerUrl("ssl", "host", 8883, ""), BrokerUrl.parse("ssl://host/ignored"))
    }

    @Test
    fun ignoresQueryAndFragment() {
        assertEquals(BrokerUrl("wss", "h", 443, "/mqtt"), BrokerUrl.parse("wss://h/mqtt?x=1#frag"))
    }

    @Test
    fun trimsWhitespaceAndLowercasesScheme() {
        assertEquals(BrokerUrl("wss", "h", 443, "/mqtt"), BrokerUrl.parse("  WSS://h/mqtt  "))
    }

    @Test
    fun rejectsMissingOrUnsupportedScheme() {
        assertNull(BrokerUrl.parse("mqtt.t420.dev"))
        assertNull(BrokerUrl.parse("192.168.1.79:1883"))
        assertNull(BrokerUrl.parse("http://h"))
        assertNull(BrokerUrl.parse("mqtt://h"))
    }

    @Test
    fun rejectsEmptyHostAndBadPorts() {
        assertNull(BrokerUrl.parse("wss://"))
        assertNull(BrokerUrl.parse("wss:///mqtt"))
        assertNull(BrokerUrl.parse("tcp://:1883"))
        assertNull(BrokerUrl.parse("tcp://h:0"))
        assertNull(BrokerUrl.parse("tcp://h:70000"))
        assertNull(BrokerUrl.parse("tcp://h:abc"))
        assertNull(BrokerUrl.parse("tcp://h:"))
        assertNull(BrokerUrl.parse(""))
    }

    @Test
    fun rejectsUserinfo() {
        assertNull(BrokerUrl.parse("wss://user:pass@h/mqtt"))
        assertNull(BrokerUrl.parse("tcp://user@h"))
    }

    @Test
    fun displayNeverContainsCredentials() {
        assertEquals("wss://mqtt.t420.dev:443/mqtt", BrokerUrl.parse("wss://mqtt.t420.dev/mqtt")!!.display())
    }

    @Test
    fun tlsAndWebSocketFlags() {
        val wss = BrokerUrl.parse("wss://h")!!
        assertEquals(true, wss.isTls && wss.isWebSocket)
        val tcp = BrokerUrl.parse("tcp://h")!!
        assertEquals(false, tcp.isTls || tcp.isWebSocket)
    }
}
