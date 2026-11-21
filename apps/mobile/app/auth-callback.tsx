import { Redirect } from 'expo-router';
import React from 'react';

/** Landing spot for the Google sign-in deep link (sunozara://auth-callback). The session code handles the rest. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
