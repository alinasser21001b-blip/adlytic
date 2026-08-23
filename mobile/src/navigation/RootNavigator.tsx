import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { WorkspaceProvider } from '../auth/WorkspaceContext';
import { LoginScreen } from '../screens/LoginScreen';
import { MainNavigator } from './MainNavigator';
import { LoadingState } from '../components/States';
import { Screen } from '../components/Screen';

/**
 * The one place auth state decides what the user sees. Cold start always
 * begins 'loading' (AuthProvider is restoring the Keychain token) — never a
 * flash of the login screen before we know whether a session exists.
 */
export function RootNavigator(): React.ReactElement {
  const { status } = useAuth();

  return (
    <NavigationContainer>
      {status === 'loading' && <Screen><LoadingState /></Screen>}
      {status === 'signedOut' && <LoginScreen />}
      {status === 'signedIn' && (
        <WorkspaceProvider>
          <MainNavigator />
        </WorkspaceProvider>
      )}
    </NavigationContainer>
  );
}
