// Voice-first: every borrower screen can read itself aloud.
// Order of preference: server audio (TTS / explain-audio) → browser speechSynthesis.
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import type { Lang } from '../api/types'
import { LANG_LABEL } from '../i18n/strings'

type Source = { kind: 'tts'; text: string; lang: Lang } | { kind: 'explain'; appId: string; fallbackText: string; lang: Lang }

let audio: HTMLAudioElement | null = null
let objectUrl: string | null = null
let token = 0
const subscribers = new Set<(id: string | null) => void>()
let activeId: string | null = null

function setActive(id: string | null) {
  activeId = id
  for (const s of subscribers) s(id)
}

export function stopSpeech() {
  token++
  if (audio) {
    audio.pause()
    audio = null
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
  setActive(null)
}

function synth(text: string, lang: Lang, my: number): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve()
    const u = new SpeechSynthesisUtterance(text)
    const code = LANG_LABEL[lang].speech
    u.lang = code
    const voices = window.speechSynthesis.getVoices()
    const voice = voices.find((v) => v.lang === code) ?? voices.find((v) => v.lang.startsWith(code.slice(0, 2)))
    if (voice) u.voice = voice
    u.rate = 0.95
    u.onend = () => resolve()
    u.onerror = () => resolve()
    if (my !== token) return resolve()
    window.speechSynthesis.speak(u)
  })
}

export async function speak(id: string, source: Source): Promise<void> {
  stopSpeech()
  const my = ++token
  setActive(id)
  try {
    const blob = source.kind === 'tts' ? await api.tts(source.text, source.lang) : await api.explainAudio(source.appId)
    if (my !== token) return
    objectUrl = URL.createObjectURL(blob)
    audio = new Audio(objectUrl)
    await new Promise<void>((resolve, reject) => {
      audio!.onended = () => resolve()
      audio!.onerror = () => reject(new Error('audio failed'))
      audio!.play().catch(reject)
    })
  } catch {
    if (my !== token) return
    await synth(source.kind === 'tts' ? source.text : source.fallbackText, source.lang, my)
  }
  if (my === token) setActive(null)
}

/** Which speech (by id) is currently playing, and helpers to toggle it. */
export function useSpeech() {
  const [active, setActiveState] = useState<string | null>(activeId)
  useEffect(() => {
    subscribers.add(setActiveState)
    return () => {
      subscribers.delete(setActiveState)
    }
  }, [])
  const toggle = useCallback((id: string, source: Source) => {
    if (activeId === id) stopSpeech()
    else void speak(id, source)
  }, [])
  return { active, toggle, stop: stopSpeech }
}
