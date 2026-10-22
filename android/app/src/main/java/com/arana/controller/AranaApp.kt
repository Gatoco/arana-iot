package com.arana.controller

import android.app.Application

class AranaApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}

class AppContainer(app: Application) {
    val credentialsStore = BrokerCredentialsStore(
        app,
        StoredLogin(
            url = app.getString(R.string.demo_server_url),
            username = app.getString(R.string.demo_username),
            password = app.getString(R.string.demo_password),
            remember = true,
        ),
    )
    val link = LinkManager()
}
