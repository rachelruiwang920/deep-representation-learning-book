# 电竞选手试训

Desktop tryout station for coaches selecting competitive players. The interface is Chinese. There is no backend: every score is computed in the browser.

## Run

```bash
cd esports-tryout
npm install
npm run dev
```

Open http://localhost:5173 on the tryout machine. A mouse is the primary input. During the click burst, Space, J, and F also count.

To check a production build:

```bash
npm run build
npm run preview
```

## Flow

One continuous session:

1. **Intro.** Coach enters a player name and starts.
2. **眼速 · 视觉反应.** Eight targets flash at random positions. The station records reaction time and hit rate. A target left unclicked for 1.2 seconds is a miss.
3. **眼速 · 动态追踪.** Follow a moving circle for 8 seconds. The score is the share of time the cursor stays inside it.
4. **手速 · 连点爆发.** Five seconds of clicking. The comparable raw speed is clicks per second.
5. **手速 · 精准瞄准.** Ten targets. Clicks on empty space are penalized. Timeouts score nothing.
6. **Results.** Eye index, hand index, overall score, and a rating: 优秀, 良好, or 一般. **再测一次** returns to the intro for the next player.

## How the numbers compare

Both indexes are 0–100.

- **眼速值** = reaction 50% + hit rate 20% + tracking 30%. Reaction scores 100 at 160 ms and 0 at 420 ms.
- **手速值** = click rate 60% + aim 40%. Click rate scores 0 at 2 per second and 100 at 10 per second. A fast hit is worth up to 100 points; each empty click subtracts 30; a timeout adds nothing.
- **综合** is the average of the two indexes. 80 and above is 优秀, 60 and above is 良好, and the rest is 一般.

The same scale is printed on the results screen.
