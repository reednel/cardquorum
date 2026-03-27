export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export const DISPLAY_NAME_MAX = 30;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 64;

export function isValidUsername(username: string): boolean {
  return (
    username.length >= USERNAME_MIN &&
    username.length <= USERNAME_MAX &&
    USERNAME_PATTERN.test(username) &&
    !username.toLowerCase().startsWith('user_') &&
    !username.toLowerCase().startsWith('deleted_')
  );
}
