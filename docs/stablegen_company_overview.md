# StableGen - Company & Product Overview

## What is StableGen?

StableGen is an AI-powered video pre-production platform that transforms rough story ideas into production-ready assets. It bridges the gap between "I have a story idea" and "I have everything I need to generate my video" — scripts, shot lists, character assets, environment backgrounds, composed frames, and video generator prompts — all in one workflow.

The core value: what used to take a production team days or weeks of pre-production work, StableGen delivers in minutes with AI-driven automation and creative control at every step.

## Who It's For

**Primary Audience:**
- **Narrative AI Short Filmmakers** — Creators telling stories through AI-generated short films. These filmmakers need professional pre-production workflows — scripts, shot lists, consistent characters, composed frames, and video prompts — to produce narrative content with AI video generators like Veo 3.1 and Kling 3.0. StableGen is built for them.

**Secondary Audiences:**
- **Micro Drama Creators** — Short-form vertical video series (1-2 minute episodes, 1-10 episode arcs). A fast-growing format that StableGen is specifically optimized for.
- **AI-First Film Studios** — Production companies built around AI video generation that need scalable, consistent pre-production pipelines.

**Additional Audiences:**
- **Commercial & Social Media Producers** — Brands and agencies creating ads, promotional videos, and social content at scale.
- **Content Creators** — YouTubers, TikTokers, and Instagram creators who need consistent, professional-quality visual content.
- **Indie Film & Animation Studios** — Low-budget productions that need professional pre-production without a large team.
- **Storyboard Artists & Pre-Viz Teams** — Anyone doing concept work, pre-visualization, or pitch decks.

## The Production Pipeline

StableGen follows a structured pipeline from concept to video-ready assets. Each stage builds on the previous one.

### 1. Projects

The top-level container. A project holds all scripts, characters, and stages for a single production — whether that's a micro drama series, a commercial, or a short film.

### 2. Scripts

Enter a rough story idea or paste in an existing script. StableGen's 6-agent AI pipeline transforms it into a professionally formatted screenplay with scenes, dialogue, action lines, and production notes.

**What you configure:**
- **Production Method** — How video clips will be generated (Traditional, First/Last Frame, Veo 3.1, Kling 3.0 Omni)
- **Max Shot Duration** — Limit individual shot length for generators with duration caps
- **Medium** — 2D Animation, 3D Animation, Anime, Live Action, Mixed Media, Motion Graphics, Stop Motion
- **Genre** — Action, Comedy, Drama, Fantasy, Horror, Mystery, Romance, Sci-Fi, Thriller, and more (21 options)
- **Distribution Type** — Micro Drama, Short Film, Web Series, Commercial, Music Video, Documentary, and more
- **Director Style** — Emulate the visual language of specific directors (Nolan, Anderson, Miyazaki, etc.) or micro drama styles
- **Writer Style** — Channel specific writing voices (Sorkin, Tarantino, etc.) or formats (Viral Social Media, Binge-Worthy Serial)
- **Dialogue Density** — None, Light, Moderate, or Heavy
- **Aspect Ratio** — 16:9, 21:9, 9:16, 1:1, and more
- **Resolution** — 1K (fast), 2K (high quality), 4K (ultra)
- **Camera** — ARRI, RED, Sony, Canon, Blackmagic, Panavision
- **Lens Style** — Anamorphic, Wide Angle, Telephoto, Vintage, Modern Sharp, and more
- **Target Duration** — Set exact, minimum, maximum, or range constraints
- **Episode Count** — For multi-episode series (1-10 episodes)
- **Audio Direction** — Sound style, music direction, and sound effects guidance

**Special capabilities:**
- **Format Only Mode** — Preserve your script exactly as written, just apply professional formatting
- **Preserve Dialogue** — Lock existing dialogue during regeneration
- **Preserve Scenes** — Prevent adding or removing scenes
- **PDF Export** — Professional screenplay format or detailed shot script format

### 3. Characters

Upload 1-3 reference images of a character. StableGen analyzes them and generates a detailed character description. Then generate visual assets across a massive combinatorial space:

- **14 Actions** — Standing, walking, running, jumping, sitting, kneeling, and more
- **11 Expressions** — Neutral, happy, sad, angry, surprised, laughing, scared, determined, and more
- **3 Zoom Levels** — Headshot, Medium Shot, Full Body
- **6 Camera Angles** — Front, Back, Left/Right Profile, Front/Rear 3/4
- **5 Camera Heights** — High Angle, Eye Level, Low Angle, Ground Level, Overwhelming View
- **6 Lighting Setups** — Soft/Hard in Cool, Neutral, and Warm

That's **148,500 possible combinations** per character — all maintaining consistent identity.

### 4. Stages (Locations/Environments)

Upload reference images for a location. Generate environment variations across:

- **13 Art Styles** — Photorealistic, Anime, Film Noir, Cyberpunk, Watercolor, Oil Painting, and more
- **8 Times of Day** — Dawn through Midnight
- **11 Weather Conditions** — Clear to Blizzard
- **8 Moods** — Peaceful, Dramatic, Mysterious, Energetic, Eerie, Romantic, Tense, Melancholic
- **6 Lighting Setups** — Same as characters

### 5. Scenes

The script is broken into scenes — each with location, time of day, action, dialogue, sound/music cues, production notes, and estimated duration. Scenes can be individually locked to protect good work while regenerating others. The AI uses locked scenes as context to maintain story continuity.

### 6. Shots

Each scene is broken into individual camera shots via a multi-agent AI pipeline. Every shot includes:

- Camera direction, angle, movement, and lens (focal length in mm)
- Timecode in/out and duration
- Framing and lighting notes
- Dialogue spoken during the shot
- Transition directions
- Video generator prompt
- First and last frame prompts

Shots can be individually locked. The system automatically splits shots that exceed the max duration setting.

### 7. Frames

The visual output stage. StableGen composites character assets onto stage backgrounds to produce the actual first and last frame images for each shot. The compositor applies:

- Proper camera perspective and lens characteristics
- Lighting and atmosphere from the shot specifications
- Character positioning based on composition notes
- Reference frames from earlier shots for visual continuity

Supports 2K and 4K resolution output.

### 8. Video Clips

Shots are automatically grouped into clips formatted for the chosen video generator. Each clip contains:

- The grouped shots (respecting per-generator limits — e.g., max 3 shots per Veo 3.1 clip)
- Generator-ready prompts (single or multi-prompt format depending on the generator)
- Required frame assets
- Total duration and shot count

Clips never mix shots from different scenes.

## Image Editing

Every generated asset (character, stage, or frame) can be refined with three editing approaches:

1. **Canvas Editor** — Full creative suite with multi-layer compositing, drawing tools, text, shapes, and AI enhancement. Best for complex compositions.
2. **Prompt-Based Editing** — Describe changes in natural language ("add sunglasses", "make the lighting warmer"). Best for style changes and additions.
3. **Precision Mask Inpainting** — Paint directly on areas to regenerate. Best for fixing specific problems (hands, faces, unwanted elements).

All edits are non-destructive. Every edit creates a new version with full parent-child tracking.

## Supported AI Models

**Script & Shot Generation:**
- OpenAI GPT-4o and GPT-4o-mini

**Character & Stage Analysis:**
- Anthropic Claude Sonnet

**Image Generation:**
- Google Gemini (2.5 Flash, 3 Pro Image Preview)
- Seedream 4.0
- Google Imagen 4
- Flux Pro
- Ideogram

**Video Generator Templates:**
- Traditional (storyboard, no video generation)
- First/Last Frame (standard keyframe approach)
- Google Veo 3.1
- Kling 3.0 Omni
- Pika Frames 2.2

## Key Differentiators

1. **End-to-End Pipeline** — From story idea to video-ready assets without switching tools. No more bouncing between a script tool, an image generator, a frame composer, and a prompt writer.
2. **Character Consistency** — 148,500+ asset combinations per character, all maintaining the same identity across every shot.
3. **Video Generator Agnostic** — Production method templates mean your work isn't locked to one video generator. Switch from Veo 3.1 to Kling 3.0 without starting over.
4. **Iterative Refinement** — Lock the parts you like, regenerate the parts you don't. The AI uses your locked content as context for better results.
5. **Production-Ready Outputs** — Professional screenplay PDFs, detailed shot scripts, high-resolution frames, and copy-paste-ready video prompts.
6. **Micro Drama Optimized** — Purpose-built for the short-form vertical video format that's exploding across platforms.
7. **Multi-Agent AI Architecture** — Specialized AI agents for each creative task (outlining, dialogue, camera work, composition) rather than one-shot generation.

## Brand Voice

- Professional but accessible — we speak the language of filmmakers without being intimidating to newcomers
- Creative empowerment — StableGen amplifies your vision, it doesn't replace it
- Speed and quality are not tradeoffs — you get both
- "From idea to video-ready in minutes, not days"
- We respect the craft — AI handles the tedious production work so creators focus on the creative work

## Technical Foundation

- Web application (Ruby on Rails 8)
- Real-time progress updates during generation
- Token-based usage system with Stripe subscription billing
- Hosted on cloud infrastructure (Digital Ocean)
