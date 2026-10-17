// Loaded lazily (dynamic import) only when the backend says Google sign-in is enabled, so
// guests and mock mode never download Firebase. firebase/app + firebase/auth only.
import { getApps, initializeApp } from '@firebase/app'
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut, type Auth, type User as FirebaseUser } from '@firebase/auth'
import type { FirebaseWebConfig } from '../api/types'

export type { Auth, FirebaseUser }

export function initAuth(cfg: FirebaseWebConfig): Auth {
  const app = getApps()[0] ?? initializeApp(cfg)
  return getAuth(app)
}

export function onUser(auth: Auth, cb: (u: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, cb)
}

export async function signInGoogle(auth: Auth) {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return signInWithPopup(auth, provider)
}

export function signOutGoogle(auth: Auth) {
  return signOut(auth)
}
