package app.revenge.manager.utils

import android.os.Environment
import app.revenge.manager.BuildConfig

object Constants {
    val TEAM_MEMBERS = listOf(
        // TODO: preencher com os membros reais do time da Pixelcord (username = GitHub)
        TeamMember("Pixelcord", "Team", "pixel-cord"),
    )

    // NOTE: This is no longer used
    val MOD_DIR = Environment.getExternalStorageDirectory().resolve(BuildConfig.MOD_NAME)

    val DUMMY_VERSION = DiscordVersion(1, 0, DiscordVersion.Type.STABLE)
}

object Intents {

    object Actions {
        const val INSTALL = "${BuildConfig.APPLICATION_ID}.intents.actions.INSTALL"
    }

    object Extras {
        const val VERSION = "${BuildConfig.APPLICATION_ID}.intents.extras.VERSION"
    }

}

object Channels {
    const val UPDATE = "${BuildConfig.APPLICATION_ID}.notifications.UPDATE"
}

data class TeamMember(
    val name: String,
    val role: String,
    val username: String = name
)