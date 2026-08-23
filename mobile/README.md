# Adlytic — iOS client (Project Alpha)

A native Expo/React Native client of the existing Adlytic backend. It
renders canonical server output; it computes none of it. See
`../docs/alpha/ALPHA_LAUNCH.md` for the full launch package (architecture,
auth, Meta OAuth, privacy, and exactly what's blocked on Apple credentials).

## Run locally

```bash
cd mobile
npm install
npm run typecheck
npx expo start
```

Points at production (`https://adlytic-production.up.railway.app`) by
default. To point at a local backend instead:

```bash
EXPO_PUBLIC_API_URL=http://localhost:3011 npx expo start
```

## Generate the native iOS project

```bash
npx expo prebuild --platform ios --clean
```

`ios/` and `android/` are gitignored on purpose — they are regenerated from
`app.json` and the `plugins` array (Continuous Native Generation). Never
hand-edit a file under `ios/`; it will be silently discarded on the next
prebuild. Change `app.json` or add a config plugin instead.

## Build and submit (requires Apple + Expo credentials — see ALPHA_LAUNCH.md)

```bash
npx eas login                                   # once
npm run build:ios:testflight                    # eas build --platform ios --profile production
npm run submit:ios                              # eas submit --platform ios --profile production
```

`eas.json`'s `production` profile auto-increments `ios.buildNumber` in
`app.json` on every build (`appVersionSource: "local"`).
