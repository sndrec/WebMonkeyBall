import { getStageListForDifficulty } from '../../course.js';
import {
  SMB2_CHALLENGE_ORDER,
  SMB2_STORY_ORDER,
  type Smb2ChallengeDifficulty,
  type Smb2CourseConfig,
} from '../../course_smb2.js';
import {
  MB2WS_CHALLENGE_ORDER,
  MB2WS_STORY_ORDER,
  type Mb2wsChallengeDifficulty,
  type Mb2wsCourseConfig,
} from '../../course_mb2ws.js';
import { GAME_SOURCES, type GameSource } from '../../shared/constants/index.js';

type SelectOption = { value: string; label: string };

function setSelectOptions(select: HTMLSelectElement, values: SelectOption[]) {
  select.innerHTML = '';
  for (const option of values) {
    const elem = document.createElement('option');
    elem.value = option.value;
    elem.textContent = option.label;
    select.appendChild(elem);
  }
}

type CourseSelectionDeps = {
  difficultySelect: HTMLSelectElement | null;
  smb1StageSelect: HTMLSelectElement | null;
  smb1Fields: HTMLElement | null;
  smb2Fields: HTMLElement | null;
  smb2ModeSelect: HTMLSelectElement | null;
  smb2ChallengeSelect: HTMLSelectElement | null;
  smb2ChallengeStageSelect: HTMLSelectElement | null;
  smb2StoryWorldSelect: HTMLSelectElement | null;
  smb2StoryStageSelect: HTMLSelectElement | null;
  defaultChallengeOptions: SelectOption[];
  resolveSelectedGameSource: () => { gameSource: GameSource; requestedGameSource: GameSource };
  hasPackForGameSource: (gameSource: GameSource) => boolean;
  getPackCourseData: () => { challenge?: { order?: any }; story?: any[] } | null;
};

export class CourseSelectionController {
  private readonly deps: CourseSelectionDeps;

  constructor(deps: CourseSelectionDeps) {
    this.deps = deps;
  }

  private getPackChallengeOrder(gameSource: GameSource) {
    if (!this.deps.hasPackForGameSource(gameSource)) {
      return null;
    }
    return this.deps.getPackCourseData()?.challenge?.order ?? null;
  }

  private getPackStoryOrder(gameSource: GameSource) {
    if (!this.deps.hasPackForGameSource(gameSource)) {
      return null;
    }
    return this.deps.getPackCourseData()?.story ?? null;
  }

  private getSmb2LikeChallengeOrder(gameSource: GameSource) {
    const packOrder = this.getPackChallengeOrder(gameSource);
    if (packOrder) {
      return packOrder;
    }
    return gameSource === GAME_SOURCES.MB2WS ? MB2WS_CHALLENGE_ORDER : SMB2_CHALLENGE_ORDER;
  }

  private getSmb2LikeStoryOrder(gameSource: GameSource) {
    const packOrder = this.getPackStoryOrder(gameSource);
    if (packOrder) {
      return packOrder;
    }
    return gameSource === GAME_SOURCES.MB2WS ? MB2WS_STORY_ORDER : SMB2_STORY_ORDER;
  }

  updateSmb2ChallengeStages() {
    const { smb2ChallengeSelect, smb2ChallengeStageSelect, defaultChallengeOptions } = this.deps;
    if (!smb2ChallengeSelect || !smb2ChallengeStageSelect) {
      return;
    }
    const { gameSource } = this.deps.resolveSelectedGameSource();
    const order = this.getSmb2LikeChallengeOrder(gameSource);
    if (this.deps.hasPackForGameSource(gameSource) && order) {
      const keys = Object.keys(order);
      if (keys.length > 0) {
        const current = smb2ChallengeSelect.value;
        const options = keys.map((key) => ({ value: key, label: key }));
        setSelectOptions(smb2ChallengeSelect, options);
        smb2ChallengeSelect.value = keys.includes(current) ? current : keys[0];
      }
    } else if (defaultChallengeOptions.length > 0) {
      const current = smb2ChallengeSelect.value;
      setSelectOptions(smb2ChallengeSelect, defaultChallengeOptions);
      const values = defaultChallengeOptions.map((option) => option.value);
      smb2ChallengeSelect.value = values.includes(current) ? current : defaultChallengeOptions[0].value;
    }
    const difficulty = smb2ChallengeSelect.value as Smb2ChallengeDifficulty | Mb2wsChallengeDifficulty;
    const stages = order[difficulty] ?? [];
    const options = stages.map((_: unknown, index: number) => ({
      value: String(index + 1),
      label: `Stage ${index + 1}`,
    }));
    setSelectOptions(smb2ChallengeStageSelect, options);
  }

  updateSmb1Stages() {
    const { difficultySelect, smb1StageSelect } = this.deps;
    if (!difficultySelect || !smb1StageSelect) {
      return;
    }
    const stages = getStageListForDifficulty(difficultySelect.value);
    const options = stages.map((stage, index) => ({
      value: String(index),
      label: stage.label,
    }));
    setSelectOptions(smb1StageSelect, options);
  }

  updateSmb2StoryOptions() {
    const { smb2StoryWorldSelect, smb2StoryStageSelect } = this.deps;
    if (!smb2StoryWorldSelect || !smb2StoryStageSelect) {
      return;
    }
    const { gameSource } = this.deps.resolveSelectedGameSource();
    const storyOrder = this.getSmb2LikeStoryOrder(gameSource);
    if (storyOrder.length === 0) {
      setSelectOptions(smb2StoryWorldSelect, []);
      setSelectOptions(smb2StoryStageSelect, []);
      return;
    }
    const worldOptions = storyOrder.map((_: unknown, index: number) => ({
      value: String(index + 1),
      label: `World ${index + 1}`,
    }));
    setSelectOptions(smb2StoryWorldSelect, worldOptions);
    const currentWorld = Math.max(0, Math.min(storyOrder.length - 1, Number(smb2StoryWorldSelect.value ?? 1) - 1));
    smb2StoryWorldSelect.value = String(currentWorld + 1);
    const stageList = storyOrder[currentWorld] ?? [];
    const stageOptions = stageList.map((_: unknown, index: number) => ({
      value: String(index + 1),
      label: `Stage ${index + 1}`,
    }));
    setSelectOptions(smb2StoryStageSelect, stageOptions);
    const currentStage = Math.max(0, Math.min(stageList.length - 1, Number(smb2StoryStageSelect.value ?? 1) - 1));
    smb2StoryStageSelect.value = String(currentStage + 1);
  }

  updateSmb2ModeFields() {
    const { smb2ModeSelect } = this.deps;
    if (!smb2ModeSelect) {
      return;
    }
    const isChallenge = smb2ModeSelect.value === 'challenge';
    document.getElementById('smb2-challenge-fields')?.classList.toggle('hidden', !isChallenge);
    document.getElementById('smb2-story-fields')?.classList.toggle('hidden', isChallenge);
  }

  updateGameSourceFields() {
    const { smb1Fields, smb2Fields } = this.deps;
    const { gameSource } = this.deps.resolveSelectedGameSource();
    const isSmb2Like = gameSource !== GAME_SOURCES.SMB1;
    smb1Fields?.classList.toggle('hidden', isSmb2Like);
    smb2Fields?.classList.toggle('hidden', !isSmb2Like);
    this.updateSmb2ModeFields();
    this.updateSmb2ChallengeStages();
    this.updateSmb2StoryOptions();
  }

  buildSmb1CourseConfig() {
    const { difficultySelect, smb1StageSelect } = this.deps;
    const difficulty = difficultySelect?.value ?? 'beginner';
    const stageIndex = Math.max(0, Number(smb1StageSelect?.value ?? 0));
    return { difficulty, stageIndex };
  }

  buildSmb2CourseConfig(): Smb2CourseConfig {
    const { smb2ModeSelect, smb2StoryWorldSelect, smb2StoryStageSelect, smb2ChallengeSelect, smb2ChallengeStageSelect } = this.deps;
    const mode = smb2ModeSelect?.value === 'story' ? 'story' : 'challenge';
    if (mode === 'story') {
      const worldIndex = Math.max(0, Number(smb2StoryWorldSelect?.value ?? 1) - 1);
      const stageIndex = Math.max(0, Number(smb2StoryStageSelect?.value ?? 1) - 1);
      return { mode, worldIndex, stageIndex };
    }
    const difficulty = (smb2ChallengeSelect?.value ?? 'beginner') as Smb2ChallengeDifficulty;
    const stageIndex = Math.max(0, Number(smb2ChallengeStageSelect?.value ?? 1) - 1);
    return { mode, difficulty, stageIndex };
  }

  buildMb2wsCourseConfig(): Mb2wsCourseConfig {
    const { smb2ModeSelect, smb2StoryWorldSelect, smb2StoryStageSelect, smb2ChallengeSelect, smb2ChallengeStageSelect } = this.deps;
    const mode = smb2ModeSelect?.value === 'story' ? 'story' : 'challenge';
    if (mode === 'story') {
      const worldIndex = Math.max(0, Number(smb2StoryWorldSelect?.value ?? 1) - 1);
      const stageIndex = Math.max(0, Number(smb2StoryStageSelect?.value ?? 1) - 1);
      return { mode, worldIndex, stageIndex };
    }
    const difficulty = (smb2ChallengeSelect?.value ?? 'beginner') as Mb2wsChallengeDifficulty;
    const stageIndex = Math.max(0, Number(smb2ChallengeStageSelect?.value ?? 1) - 1);
    return { mode, difficulty, stageIndex };
  }
}
