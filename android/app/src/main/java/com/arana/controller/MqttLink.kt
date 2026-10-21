package com.arana.controller

import android.os.Handler
import android.os.Looper
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken
import org.eclipse.paho.client.mqttv3.MqttCallbackExtended
import org.eclipse.paho.client.mqttv3.MqttClient
import org.eclipse.paho.client.mqttv3.MqttConnectOptions
import org.eclipse.paho.client.mqttv3.MqttException
import org.eclipse.paho.client.mqttv3.MqttMessage
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence
import java.util.UUID
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/** Broker settings passed between screens. */
data class BrokerConfig(
    val host: String,
    val port: Int,
    val username: String,
    val password: String,
) {
    val uri: String get() = "tcp://$host:$port"
}

/**
 * Thin Paho wrapper shared by Control and Body Mode. Blocking Paho calls run on a
 * single background thread; every callback is posted to the main thread.
 */
class MqttLink(private val listener: Listener) {

    interface Listener {
        fun onConnected(uri: String)
        fun onDisconnected(error: String?)
        fun onMessage(topic: String, payload: String)
    }

    private val main = Handler(Looper.getMainLooper())
    private val io: ExecutorService = Executors.newSingleThreadExecutor()
    @Volatile private var client: MqttClient? = null
    private val subscriptions = mutableListOf<String>()

    @Volatile private var closed = false

    val isConnected: Boolean get() = client?.isConnected == true

    private fun post(block: () -> Unit) {
        main.post { if (!closed) block() }
    }

    fun connect(config: BrokerConfig, subscribe: List<String> = emptyList()) {
        synchronized(subscriptions) {
            subscriptions.clear()
            subscriptions.addAll(subscribe)
        }
        io.execute {
            try {
                val c = MqttClient(config.uri, "arana-android-" + UUID.randomUUID().toString().take(8), MemoryPersistence())
                c.setCallback(object : MqttCallbackExtended {
                    override fun connectComplete(reconnect: Boolean, serverURI: String) {
                        // Re-subscribe after automatic reconnects (clean session).
                        if (reconnect) io.execute { subscribeAll(c) }
                        post { listener.onConnected(serverURI) }
                    }

                    override fun connectionLost(cause: Throwable?) {
                        post { listener.onDisconnected(cause?.message ?: "connection lost") }
                    }

                    override fun messageArrived(topic: String, message: MqttMessage) {
                        val payload = String(message.payload, Charsets.UTF_8)
                        post { listener.onMessage(topic, payload) }
                    }

                    override fun deliveryComplete(token: IMqttDeliveryToken?) = Unit
                })
                val options = MqttConnectOptions().apply {
                    isCleanSession = true
                    isAutomaticReconnect = true
                    connectionTimeout = 10
                    keepAliveInterval = 30
                    if (config.username.isNotEmpty()) {
                        userName = config.username
                        password = config.password.toCharArray()
                    }
                }
                client = c
                c.connect(options)
                subscribeAll(c)
            } catch (e: MqttException) {
                post { listener.onDisconnected(e.message ?: e.toString()) }
            } catch (e: IllegalArgumentException) {
                post { listener.onDisconnected(e.message ?: "invalid broker address") }
            }
        }
    }

    private fun subscribeAll(c: MqttClient) {
        val topics = synchronized(subscriptions) { subscriptions.toList() }
        try {
            for (t in topics) c.subscribe(t, 0)
        } catch (e: MqttException) {
            post { listener.onDisconnected(e.message ?: e.toString()) }
        }
    }

    /** Fire-and-forget QoS 0 publish. Dropped silently while disconnected. */
    fun publish(topic: String, payload: String) {
        io.execute {
            val c = client ?: return@execute
            if (!c.isConnected) return@execute
            try {
                c.publish(topic, payload.toByteArray(Charsets.UTF_8), 0, false)
            } catch (e: MqttException) {
                post { listener.onDisconnected(e.message ?: e.toString()) }
            }
        }
    }

    /** Disconnects and releases the background thread. The link cannot be reused. */
    fun close() {
        closed = true
        main.removeCallbacksAndMessages(null)
        io.execute {
            val c = client ?: return@execute
            client = null
            try {
                if (c.isConnected) c.disconnect(1000)
                c.close()
            } catch (_: MqttException) {
                // Closing anyway.
            }
        }
        io.shutdown()
    }
}
