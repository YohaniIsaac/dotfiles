import { createExternal } from "ags"
import AstalMpris from "gi://AstalMpris"

// Instancia dedicada a un bus name fijo — no es el manager Mpris.get_default() (que
// trackea TODOS los reproductores). Sólo escucha org.mpris.MediaPlayer2.spotify,
// se queda con available=false si Spotify no está corriendo, y available=true
// cuando aparece — sin filtrar listas ni interferir con otros reproductores (navegador, etc).
// Compartido entre BottomBar (píldora) y MediaPlayer (popup grande).
export const spotify = AstalMpris.Player.new("spotify")

export type MediaState = {
  available: boolean
  title: string
  artist: string
  cover: string
  playing: boolean
  volume: number
  shuffle: boolean
  length: number   // duración del track en segundos — position se trackea aparte (poll) en MediaPlayer.tsx
}

function computeMedia(): MediaState {
  return {
    available: spotify.available && spotify.title !== "",
    title:     spotify.title  ?? "",
    artist:    spotify.artist ?? "",
    cover:     spotify.cover_art ?? "",
    playing:   spotify.playback_status === AstalMpris.PlaybackStatus.PLAYING,
    volume:    spotify.volume ?? 0,
    shuffle:   spotify.shuffle_status === AstalMpris.Shuffle.ON,
    length:    spotify.length ?? 0,
  }
}

export const mediaState = createExternal<MediaState>(
  computeMedia(),
  (set) => {
    const refresh = () => set(computeMedia())
    const ids = [
      spotify.connect("notify::available",       refresh),
      spotify.connect("notify::title",           refresh),
      spotify.connect("notify::artist",          refresh),
      spotify.connect("notify::cover-art",       refresh),
      spotify.connect("notify::playback-status", refresh),
      spotify.connect("notify::volume",          refresh),
      spotify.connect("notify::shuffle-status",  refresh),
      spotify.connect("notify::length",          refresh),
    ]
    return () => ids.forEach(id => spotify.disconnect(id))
  }
)
