/**
 * "Do we currently have network" — SyncEngineProvider drains the offline queue
 * when this flips to online; SyncStatusBadge and the save flows read it.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

interface NetworkContextValue {
  isOnline: boolean;
}

const NetworkContext = createContext<NetworkContextValue>({ isOnline: true });

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // isInternetReachable is null while NetInfo is still probing right after
    // launch — only an explicit `false` counts as offline, so a cold start
    // doesn't flash "Offline".
    return NetInfo.addEventListener((state) => {
      setIsOnline(state.isConnected !== false && state.isInternetReachable !== false);
    });
  }, []);

  return <NetworkContext.Provider value={{ isOnline }}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext);
}
