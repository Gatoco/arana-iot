package com.arana.controller

import com.hivemq.client.mqtt.mqtt3.exceptions.Mqtt3ConnAckException
import com.hivemq.client.mqtt.mqtt3.message.connect.connack.Mqtt3ConnAckReturnCode
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.TimeoutException
import javax.net.ssl.SSLException

/** Why a broker connection attempt failed, already mapped to something a person can act on. */
enum class ConnectError { BAD_CREDENTIALS, UNREACHABLE, TLS, REFUSED, INVALID_URL, OTHER }

class ConnectFailure(val error: ConnectError, val detail: String?, cause: Throwable? = null) : Exception(detail, cause)

object ConnectErrorClassifier {
    /** Walks the cause chain; the first recognizable cause wins. Never inspects the password. */
    fun classify(t: Throwable): ConnectError {
        var cur: Throwable? = t
        var depth = 0
        while (cur != null && depth < 12) {
            when (cur) {
                is Mqtt3ConnAckException -> return when (cur.mqttMessage.returnCode) {
                    Mqtt3ConnAckReturnCode.BAD_USER_NAME_OR_PASSWORD,
                    Mqtt3ConnAckReturnCode.NOT_AUTHORIZED -> ConnectError.BAD_CREDENTIALS
                    else -> ConnectError.OTHER
                }
                is SSLException -> return ConnectError.TLS
                is UnknownHostException, is NoRouteToHostException,
                is SocketTimeoutException, is TimeoutException -> return ConnectError.UNREACHABLE
                // Never match on message text: it is localized. Netty's timeout is a ConnectException subclass.
                is ConnectException ->
                    return if (cur.javaClass.simpleName == "ConnectTimeoutException") ConnectError.UNREACHABLE
                    else ConnectError.REFUSED
                is IllegalArgumentException -> return ConnectError.INVALID_URL
            }
            val msg = cur.message.orEmpty()
            if (msg.contains("handshake", true) || msg.contains("certificate", true)) return ConnectError.TLS
            cur = cur.cause
            depth++
        }
        return ConnectError.OTHER
    }
}
