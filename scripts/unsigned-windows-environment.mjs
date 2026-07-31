const signingEnvironmentVariables = [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "WIN_CSC_LINK",
  "WIN_CSC_KEY_PASSWORD",
]

export function unsignedWindowsEnvironment(environment) {
  const unsignedEnvironment = { ...environment }

  for (const variable of signingEnvironmentVariables) {
    delete unsignedEnvironment[variable]
  }

  unsignedEnvironment.CSC_IDENTITY_AUTO_DISCOVERY = "false"
  return unsignedEnvironment
}
