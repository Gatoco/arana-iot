package com.arana.controller

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Opt-in broker test: runs only when ARANA_BROKER_URL, ARANA_BROKER_USER and ARANA_BROKER_PASS are
 * set (for example `ws://192.168.1.79:9001/mqtt`). Skipped otherwise so CI needs no broker.
 */
class LinkManagerBrokerTest {
    private val urlText = System.getenv("ARANA_BROKER_URL")
    private val user = System.getenv("ARANA_BROKER_USER")
    private val pass = System.getenv("ARANA_BROKER_PASS")

    private fun creds(password: String) = BrokerCredentials(
        BrokerUrl.parse(requireNotNull(urlText))!!,
        requireNotNull(user),
        password,
    )
    private fun newLink() = LinkManager(clock = { System.nanoTime() / 1_000_000 })

    private fun chain(t: Throwable): String =
        generateSequence(t) { it.cause }.take(8).joinToString(" <- ") { it.javaClass.name + ":" + it.message }

    private fun enabled() = assumeTrue("broker env not set", urlText != null && user != null && pass != null)

    @Test
    fun wrongPasswordFailsWithBadCredentials() = runBlocking {
        enabled()
        val link = newLink()
        val r = link.connect(creds("definitely-wrong"))
        assertTrue(r.isFailure)
        val f = r.exceptionOrNull() as ConnectFailure
        assertEquals(chain(f), ConnectError.BAD_CREDENTIALS, f.error)
        assertFalse(link.publish(Command.Stop))
    }

    @Test
    fun unreachableHostFailsWithoutHanging() = runBlocking {
        enabled()
        val link = newLink()
        val bad = BrokerCredentials(
            BrokerUrl.parse("tcp://127.0.0.1:1")!!,
            requireNotNull(user),
            requireNotNull(pass),
        )
        val r = withTimeout(20_000) { link.connect(bad) }
        assertTrue(r.isFailure)
        val err = (r.exceptionOrNull() as ConnectFailure).error
        assertTrue("got $err", err == ConnectError.REFUSED || err == ConnectError.UNREACHABLE)
    }

    @Test
    fun commandsAndTelemetryRoundTrip() = runBlocking {
        enabled()
        val controller = newLink()
        val body = newLink()
        val password = requireNotNull(pass)
        val rc = controller.connect(creds(password))
        assertTrue(rc.exceptionOrNull()?.let { chain(it) }, rc.isSuccess)
        val rb = body.connect(creds(password))
        assertTrue(rb.exceptionOrNull()?.let { chain(it) }, rb.isSuccess)
        body.subscribeCommands()
        delay(500)

        assertTrue(controller.publish(Command.Pose(Pose.HELLO)))
        val got = withTimeout(5_000) { body.commands.first() }
        assertEquals(Command.Pose(Pose.HELLO), ProtocolCodec.decodeCommand(got))

        val sim = BodySim()
        body.publishTelemetry(ProtocolCodec.encodeTelemetry(sim.telemetry(1L)))
        withTimeout(5_000) { while (controller.telemetry.value == null) delay(50) }
        assertEquals(8, controller.telemetry.value!!.joints.size)
        assertFalse(controller.noTelemetry())

        controller.disconnect()
        assertEquals(LinkState.Disconnected, controller.currentState())
        assertFalse(controller.publish(Command.Stop))
        body.disconnect(sendStop = false)
    }
}
