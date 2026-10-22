package com.arana.controller

import android.os.SystemClock
import com.hivemq.client.mqtt.MqttClient
import com.hivemq.client.mqtt.MqttGlobalPublishFilter
import com.hivemq.client.mqtt.datatypes.MqttQos
import com.hivemq.client.mqtt.mqtt3.Mqtt3AsyncClient
import com.hivemq.client.mqtt.mqtt3.message.publish.Mqtt3Publish
import com.hivemq.client.mqtt.MqttWebSocketConfig
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume

/** What the UI may show about the active session. Never contains the password. */
data class SessionInfo(val serverDisplay: String, val username: String)

/**
 * App-scoped MQTT session. Login creates it, Main reuses it. The password lives only inside the
 * HiveMQ connect message for the lifetime of the connection (needed for automatic reconnect).
 */
class LinkManager(private val clock: () -> Long = { SystemClock.elapsedRealtime() }) {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val lock = Any()

    private val _state = MutableStateFlow<LinkState>(LinkState.Disconnected)
    val state: StateFlow<LinkState> = _state.asStateFlow()

    private val _telemetry = MutableStateFlow<Telemetry?>(null)
    val telemetry: StateFlow<Telemetry?> = _telemetry.asStateFlow()

    /** [clock] timestamp of the last accepted telemetry packet, 0 when none. */
    private val _lastTelemetryAt = MutableStateFlow(0L)
    val lastTelemetryAt: StateFlow<Long> = _lastTelemetryAt.asStateFlow()

    private val _session = MutableStateFlow<SessionInfo?>(null)
    val session: StateFlow<SessionInfo?> = _session.asStateFlow()

    private val _packets = MutableSharedFlow<PacketLogEntry>(extraBufferCapacity = 128)
    val packets: SharedFlow<PacketLogEntry> = _packets

    /** Last [LOG_SIZE] packets; survives fragment recreation. */
    private val _log = MutableStateFlow<List<PacketLogEntry>>(emptyList())
    val log: StateFlow<List<PacketLogEntry>> = _log.asStateFlow()

    @Volatile private var client: Mqtt3AsyncClient? = null
    @Volatile private var everConnected = false
    /** [clock] time of the last CONNACK (initial or automatic reconnect). */
    @Volatile private var connectedAt = 0L
    private var lastTelemetryLogAt = 0L

    fun currentState(): LinkState = _state.value

    fun nowMs(): Long = clock()

    /** True when a telemetry packet arrived within [BODY_TIMEOUT_MS]. */
    fun bodyAlive(): Boolean {
        val at = _lastTelemetryAt.value
        return at != 0L && clock() - at <= BODY_TIMEOUT_MS
    }

    /**
     * True when the broker link is up but no body telemetry arrived for [BODY_TIMEOUT_MS]
     * (measured from the later of the last packet and the connection time).
     */
    fun noTelemetry(): Boolean {
        if (_state.value !is LinkState.Connected) return false
        return clock() - maxOf(_lastTelemetryAt.value, connectedAt) > BODY_TIMEOUT_MS
    }

    /** Opens the connection and completes after CONNACK. Any previous session is dropped first. */
    suspend fun connect(credentials: BrokerCredentials): Result<Unit> {
        disconnect(sendStop = false)
        _state.value = LinkState.Connecting
        everConnected = false
        val c = try {
            buildClient(credentials.url)
        } catch (e: IllegalArgumentException) {
            return failed(ConnectFailure(ConnectError.INVALID_URL, e.message, e))
        }
        client = c
        c.publishes(MqttGlobalPublishFilter.ALL) { onPublish(it) }

        val outcome: Result<Unit>? = withTimeoutOrNull(HARD_TIMEOUT_MS) { suspendCancellableCoroutine<Result<Unit>> { cont ->
            c.connectWith()
                .cleanSession(true)
                .keepAlive(KEEP_ALIVE_S)
                .simpleAuth()
                .username(credentials.username)
                .password(credentials.password.toByteArray(Charsets.UTF_8))
                .applySimpleAuth()
                .willPublish()
                .topic(Topic.CMD)
                .payload(STOP_JSON.toByteArray(Charsets.UTF_8))
                .qos(MqttQos.AT_MOST_ONCE)
                .applyWillPublish()
                .send()
                .whenComplete { _, err ->
                    if (cont.isActive) cont.resume(if (err == null) Result.success(Unit) else Result.failure(err))
                }
            cont.invokeOnCancellation { c.disconnect() }
        } }
        // null = the hard timeout fired; a successful CONNACK is Result.success, never null.
        val result: Throwable? = if (outcome == null) {
            java.util.concurrent.TimeoutException("no CONNACK within ${HARD_TIMEOUT_MS / 1000} s")
        } else {
            outcome.exceptionOrNull()
        }
        if (result != null) {
            c.disconnect()
            client = null
            return failed(ConnectFailure(ConnectErrorClassifier.classify(result), result.message, result))
        }
        everConnected = true
        connectedAt = clock()
        _session.value = SessionInfo(credentials.url.display(), credentials.username)
        _state.value = LinkState.Connected
        emitSys("connected ${credentials.url.display()}")
        return Result.success(Unit)
    }

    private fun failed(f: ConnectFailure): Result<Unit> {
        _state.value = LinkState.Failed(f.error.name)
        _session.value = null
        return Result.failure(f)
    }

    internal fun buildClient(url: BrokerUrl): Mqtt3AsyncClient {
        // Timeouts first: the nested transport builder must not be applied after host/port/WebSocket.
        val b = MqttClient.builder()
            .useMqttVersion3()
            .identifier("arana-android-" + UUID.randomUUID().toString().take(8))
            .transportConfig()
            .socketConnectTimeout(CONNECT_TIMEOUT_S, TimeUnit.SECONDS)
            .mqttConnectTimeout(CONNECT_TIMEOUT_S, TimeUnit.SECONDS)
            .applyTransportConfig()
            .serverHost(url.host)
            .serverPort(url.port)
            .automaticReconnectWithDefaultConfig()
            .addConnectedListener { onConnectedEvent() }
            .addDisconnectedListener { ctx ->
                if (!everConnected) {
                    ctx.reconnector.reconnect(false)
                } else {
                    val reason = ctx.cause?.message
                    _telemetry.value = null
                    _lastTelemetryAt.value = 0L
                    _state.value = LinkState.Reconnecting(reason)
                    emitSys("link lost: ${reason ?: "unknown"}")
                }
            }
        if (url.isTls) b.sslWithDefaultConfig()
        if (url.isWebSocket) {
            b.webSocketConfig(MqttWebSocketConfig.builder().serverPath(url.path.trimStart('/')).build())
        }
        return b.buildAsync()
    }

    /** Runs on every CONNACK, including automatic reconnects: subscribe again (clean session). */
    private fun onConnectedEvent() {
        val c = client ?: return
        c.subscribeWith().topicFilter(Topic.TELEMETRY).qos(MqttQos.AT_MOST_ONCE).send()
            .whenComplete { _, err ->
                if (err != null) emitSys("subscribe failed: ${err.message}")
                else if (everConnected) {
                    connectedAt = clock()
                    _state.value = LinkState.Connected
                    emitSys("reconnected")
                }
            }
    }

    private fun onPublish(p: Mqtt3Publish) {
        val topic = p.topic.toString()
        val text = String(p.payloadAsBytes, Charsets.UTF_8)
        when (topic) {
            Topic.TELEMETRY -> {
                val t = ProtocolCodec.decodeTelemetry(text)
                if (t == null) {
                    emit(Direction.RX, topic, text)
                    return
                }
                val now = clock()
                _telemetry.value = t
                _lastTelemetryAt.value = now
                // Telemetry is 30 Hz; log one packet per second so commands stay visible.
                if (now - lastTelemetryLogAt >= TELEMETRY_LOG_EVERY_MS) {
                    lastTelemetryLogAt = now
                    emit(Direction.RX, topic, text)
                }
            }
            else -> emit(Direction.RX, topic, text)
        }
    }

    /** QoS 0 publish to `arana/cmd`. Returns false (and sends nothing) unless connected. */
    fun publish(command: Command): Boolean {
        val c = client
        if (c == null || _state.value !is LinkState.Connected) return false
        val json = ProtocolCodec.encodeCommand(command)
        c.publishWith()
            .topic(Topic.CMD)
            .qos(MqttQos.AT_MOST_ONCE)
            .payload(json.toByteArray(Charsets.UTF_8))
            .send()
        emit(Direction.TX, Topic.CMD, json, unconfirmed = !bodyAlive())
        return true
    }

    /** Publishes raw telemetry (Body Mode only). Returns false unless connected. */
    fun publishTelemetry(json: String): Boolean {
        val c = client
        if (c == null || _state.value !is LinkState.Connected) return false
        c.publishWith().topic(Topic.TELEMETRY).qos(MqttQos.AT_MOST_ONCE)
            .payload(json.toByteArray(Charsets.UTF_8)).send()
        return true
    }

    fun unsubscribeCommands() {
        client?.unsubscribeWith()?.topicFilter(Topic.CMD)?.send()
    }

    /** Subscribes to commands (Body Mode). The shared publish listener routes them to [commands]. */
    fun subscribeCommands() {
        val c = client ?: return
        c.subscribeWith().topicFilter(Topic.CMD).qos(MqttQos.AT_MOST_ONCE).send()
    }

    private val _commands = MutableSharedFlow<String>(extraBufferCapacity = 64)
    /** Raw `arana/cmd` payloads received (only after [subscribeCommands]). */
    val commands: SharedFlow<String> = _commands

    /**
     * Drops the connection. With [sendStop] a `stop` goes out first (QoS 0, best effort).
     * The session info and telemetry are cleared.
     */
    fun disconnect(sendStop: Boolean = true) {
        val c = synchronized(lock) { client.also { client = null } }
        everConnected = false
        if (c != null) {
            if (sendStop && _state.value is LinkState.Connected) {
                c.publishWith().topic(Topic.CMD).qos(MqttQos.AT_MOST_ONCE)
                    .payload(STOP_JSON.toByteArray(Charsets.UTF_8)).send()
                    .whenComplete { _, _ -> c.disconnect() }
            } else {
                c.disconnect()
            }
        }
        _telemetry.value = null
        _lastTelemetryAt.value = 0L
        _session.value = null
        _state.value = LinkState.Disconnected
    }

    private fun emitSys(text: String) = emit(Direction.SYS, "-", text)

    private fun emit(direction: Direction, topic: String, json: String, unconfirmed: Boolean = false) {
        val e = PacketLogEntry(System.currentTimeMillis(), direction, topic, json, unconfirmed)
        _log.update { (it + e).takeLast(LOG_SIZE) }
        _packets.tryEmit(e)
        if (direction == Direction.RX && topic == Topic.CMD) _commands.tryEmit(json)
    }

    fun clearLog() {
        _log.value = emptyList()
    }

    companion object {
        const val BODY_TIMEOUT_MS = 3000L
        /** Upper bound for the whole attempt so the login can never hang. */
        private const val HARD_TIMEOUT_MS = 15_000L
        private const val KEEP_ALIVE_S = 30
        private const val CONNECT_TIMEOUT_S = 10L
        private const val LOG_SIZE = 50
        private const val TELEMETRY_LOG_EVERY_MS = 1000L
        private const val STOP_JSON = """{"kind":"stop"}"""
    }
}
