export function findGoogleClickable(host: HTMLElement | null): HTMLElement | null {
  if (!host) return null;
  return (
    host.querySelector<HTMLElement>('[role="button"]') ??
    host.querySelector<HTMLElement>("div[tabindex='0']") ??
    host.querySelector<HTMLElement>("div[tabindex]")
  );
}

export function mountGoogleSignInButton(
  host: HTMLElement,
  clientId: string,
  callback: (response: { credential?: string }) => void,
  width = 320,
): boolean {
  if (!window.google?.accounts?.id) return false;

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback,
    ux_mode: "popup",
    auto_select: false,
  });

  host.innerHTML = "";
  window.google.accounts.id.renderButton(host, {
    type: "standard",
    theme: "outline",
    size: "large",
    width,
    text: "signin_with",
    logo_alignment: "left",
  });

  return Boolean(findGoogleClickable(host));
}
