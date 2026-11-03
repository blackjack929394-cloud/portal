package com.dogma.portal.ui.servers

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dogma.portal.AppState
import com.dogma.portal.data.ProxyNode
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.Caption
import com.dogma.portal.ui.components.DogmaIcon
import com.dogma.portal.ui.components.DogmaIconKind
import com.dogma.portal.ui.components.PageTitle
import com.dogma.portal.ui.components.SearchBox
import com.dogma.portal.ui.components.ServerRow
import com.dogma.portal.ui.theme.dogmaPalette

@Composable
fun ServersScreen(
    state: AppState,
    t: Strings,
    onSelectNode: (ProxyNode) -> Unit,
    onToggleFavorite: (String) -> Unit,
    onRefresh: () -> Unit,
    onPing: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()
    var search by rememberSaveable { mutableStateOf("") }

    LaunchedEffect(Unit) {
        onRefresh()
        onPing()
    }

    val query = search.trim().lowercase()
    val matches = state.nodes.filter {
        query.isEmpty() || it.name.lowercase().contains(query) || it.host.contains(query)
    }
    val favoriteNames = state.settings.favorites
    val favorites = matches.filter { favoriteNames.contains(it.name) }

    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            start = 22.dp,
            end = 22.dp,
            top = 14.dp,
            bottom = 28.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            PageTitle(t["serversTitle"])
            Spacer(Modifier.height(16.dp))
            SearchBox(
                value = search,
                onValueChange = { search = it },
                placeholder = t["searchServers"],
            )
            Spacer(Modifier.height(4.dp))
        }

        if (favorites.isNotEmpty()) {
            item {
                SectionCaption(DogmaIconKind.STAR, t["favorites"])
            }
            items(favorites, key = { "fav-" + it.host + it.name }) { node ->
                ServerRow(
                    node = node,
                    selected = state.selected?.name == node.name,
                    ping = state.pings[node.host],
                    pendingPing = !state.pings.containsKey(node.host),
                    favorite = true,
                    onSelect = { onSelectNode(node) },
                    onToggleFavorite = { onToggleFavorite(node.name) },
                )
            }
        }

        item {
            SectionCaption(DogmaIconKind.SERVERS, t["allServers"])
        }

        if (state.nodesLoading && state.nodes.isEmpty()) {
            item {
                Text(
                    t["serversLoading"],
                    color = p.muted,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(vertical = 18.dp),
                )
            }
        } else if (state.nodes.isEmpty()) {
            item {
                Text(
                    state.nodesError ?: t["noServers"],
                    color = p.muted,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(vertical = 18.dp),
                )
            }
        } else {
            items(matches, key = { it.host + it.name }) { node ->
                ServerRow(
                    node = node,
                    selected = state.selected?.name == node.name,
                    ping = state.pings[node.host],
                    pendingPing = !state.pings.containsKey(node.host),
                    favorite = favoriteNames.contains(node.name),
                    onSelect = { onSelectNode(node) },
                    onToggleFavorite = { onToggleFavorite(node.name) },
                )
            }
        }
    }
}

@Composable
private fun SectionCaption(icon: DogmaIconKind, text: String) {
    val p = dogmaPalette()
    androidx.compose.foundation.layout.Row(
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
    ) {
        DogmaIcon(icon, Modifier.size(13.dp), tint = p.muted)
        Caption(text, Modifier.weight(1f))
    }
}
