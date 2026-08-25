"use client";

// Client-side auth context: exposes the signed-in Firebase user plus
// Google sign-in/out. All privileged work happens server-side — this
// component only obtains the ID token that /api/chat will verify
// against the Admin SDK (Article 3).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseClient } from "@/lib/firebase.client";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOutUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { auth, db } = firebaseClient();
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
      if (next) {
        // Best-effort profile upsert into the caller's OWN subtree
        // (rules scope this write to next.uid). Never blocks sign-in.
        setDoc(
          doc(db, "users", next.uid),
          {
            displayName: next.displayName ?? "",
            email: next.email ?? "",
            photoURL: next.photoURL ?? "",
            createdAt: serverTimestamp(), // rules require serverTimestamp()
          },
          { merge: true },
        ).catch((err) => console.error("profile upsert failed:", err));
      }
    });
  }, []);

  const signIn = useCallback(async () => {
    const { auth } = firebaseClient();
    await signInWithPopup(auth, new GoogleAuthProvider());
  }, []);

  const signOutUser = useCallback(async () => {
    const { auth } = firebaseClient();
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({ user, loading, signIn, signOutUser }),
    [user, loading, signIn, signOutUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
