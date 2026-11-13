import { createContext, useContext } from 'react';
export const PanelIdentity = createContext<string | null>(null);
export function usePanelEmail() { return useContext(PanelIdentity); }
