// Browser builds retain the in-app inbox; native push is implemented separately.
export async function enableDevicePush(_prompt = true): Promise<string> { return "Device push is available in the iOS and Android apps."; }
export async function removeDevicePush(): Promise<void> {}
export function listenForPush(_userId: string, _open: () => void): () => void { return () => {}; }
