/**
 * Token storage — native (Keychain / Keystore) via expo-secure-store.
 * The web build uses secureStore.web.ts (localStorage) — Metro picks the
 * platform file automatically, so nothing here ever runs on web.
 */
import * as SecureStore from 'expo-secure-store';

export const getItem = (key: string) => SecureStore.getItemAsync(key);
export const setItem = (key: string, value: string) => SecureStore.setItemAsync(key, value);
export const deleteItem = (key: string) => SecureStore.deleteItemAsync(key);
