/*
 * colonist.io wire protocol constants, extracted from the production bundle
 * (shared.*.js / ui-game.*.js, September 2026). Every WebSocket frame decodes
 * to { id, data }. On the game channel, data = { type, sequence, payload }.
 */
var CCT = globalThis.CCT || (globalThis.CCT = {});

CCT.Protocol = (function () {
  'use strict';

  // data.type on the game channel (GameMsg enum in the client)
  var GameMsg = {
    FirstGameState: 1,
    BuildGame: 4,
    TogglePauseGame: 5,
    CanResignGame: 6,
    PlayerControllerState: 12,
    GameSettings: 44,
    GameEndState: 45,
    RematchLink: 46,
    EndGameText: 47,
    SpectatorData: 48,
    PlayerDisconnected: 68,
    PlayerReconnected: 69,
    DiscardBroadcast: 70,
    SpectatorChatMessage: 73,
    Ping: 76,
    TriggerClientGameStateReset: 90,
    GameStateUpdated: 91,
    ReplayData: 92,
    EndOfInitialPlacement: 93
  };

  // gameLogState[i].text.type
  var Log = {
    PlayerReconnecting: 0,
    BoughtDevelopmentCard: 1,
    WelcomeMessage: 2,
    StartedSpectating: 3,
    PlayerPlacedPiece: 4,
    BuiltPiece: 5,
    PlayerMovedPiece: 6,
    UpgradedKnight: 7,
    ActivatedKnight: 8,
    RemovedKnight: 9,
    RolledDice: 10,
    MovedRobber: 11,
    PlacedMetropolis: 12,
    ReceivedCard: 13,
    StolenResourceCardThief: 14,
    StolenResourceCardVictim: 15,
    StolenResourceCardClosed: 16,
    StolenDevelopmentCardThief: 17,
    StolenDevelopmentCardVictim: 18,
    StolenDevelopmentCardClosed: 19,
    PlayerPlayedDevelopmentCard: 20,
    YearOfPlentyTookFromBank: 21,
    LeftTheGame: 22,
    WasInactiveAndKicked: 23,
    Disconnected: 24,
    StoppedSpectating: 25,
    GameEndMessage: 37,
    PlayerCouldNotStealFrom: 39,
    Separator: 44,
    PlayerWonTheGame: 45,
    GameEndedDueToServerRestart: 46,
    ResourceDistribution: 47,
    NotEnoughCardsInBankToDistribute: 48,
    TileBlockedByRobber: 49,
    PlayerDiscarded: 55,
    LostMetropolis: 61,
    PlayerUpgradedImprovementTo: 62,
    PlayerReceivedAchievement: 66,
    PlayerLostAchievement: 67,
    PlayerPassedAchievementTo: 68,
    NoPlayerToStealFrom: 74,
    PlayerStoleUsingMonopoly: 86,
    PlayerReceivedVPProgressCard: 95,
    ExchangedCardsThief: 103,
    ExchangedCardsVictim: 104,
    ExchangedCardsClosed: 105,
    PlayerIsStealingFrom: 106,
    PlayerSelectedCard: 107,
    PlayerResigned: 112,
    PlayerTradedWithPlayer: 115,
    PlayerTradedWithBank: 116,
    PlayerWantsToCounterOfferWith: 117,
    PlayerWantsToTradeWith: 118,
    PlayerPlacedKnight: 132,
    PlayerMovedKnight: 133,
    ChatCommandGetAllResources: 134,
    ChatCommandGetCard: 135,
    ChatCommandRollAll: 136,
    ChatCommandRollDice: 137,
    ChatCommandRollNextDice: 138,
    CantStealPlayersDontHaveCards: 139,
    DiceRolledAutomatically: 141,
    ChatCommandDiscardAll: 142,
    NoResourcesInBankToDistribute: 143,
    PlayerSelectsFewerResourcesDueToBankShortage: 144,
    NotEnoughCardsInBankToCompleteDistribution: 145,
    NotEnoughCardsInBankForAffectedPlayers: 146,
    RobberAutomaticallyMoved: 147
  };

  var Card = {
    ResourceBack: 0,
    Lumber: 1,
    Brick: 2,
    Wool: 3,
    Grain: 4,
    Ore: 5,
    Cloth: 6,
    Coin: 7,
    Paper: 8,
    AnyResource: 9,
    DevelopmentBack: 10,
    Knight: 11,
    VictoryPoint: 12,
    Monopoly: 13,
    RoadBuilding: 14,
    YearOfPlenty: 15,
    CommodityBack: 16
  };

  var Piece = { Road: 0, Ship: 1, Settlement: 2, City: 3, CityWall: 4, Robber: 5, Pirate: 6 };

  var Distribution = { StartingResources: 0, ResourceTile: 1, GoldTile: 2, Aqueduct: 3 };

  var Improvement = { Trade: 0, Politics: 1, Science: 2 };

  var Mode = { TutorialClassic: 0, Classic: 1, Seafarers: 2, CitiesAndKnights: 3, CitiesAndKnightsSeafarers: 4 };

  var Color = {
    None: 0, Red: 1, Blue: 2, Orange: 3, Green: 4, Black: 5, Bronze: 6,
    Silver: 7, Gold: 8, White: 9, Purple: 10, MysticBlue: 11, Pink: 12
  };

  var ColorHex = {
    0: '#9e9e9e', 1: '#e27174', 2: '#4f7bd6', 3: '#e09742', 4: '#62b95d', 5: '#5a5a5a',
    6: '#b07a4e', 7: '#b8c0c8', 8: '#d9b23a', 9: '#e8e8e8', 10: '#a06cd5', 11: '#5c8fbf', 12: '#ea7bb0'
  };

  // Tracked card types, in engine order (index 0..7). Index 8 is the
  // "unknown type" slot used when the server reports cards we could not see.
  var TYPES = [Card.Lumber, Card.Brick, Card.Wool, Card.Grain, Card.Ore, Card.Cloth, Card.Coin, Card.Paper];
  var TYPE_NAMES = ['lumber', 'brick', 'wool', 'grain', 'ore', 'cloth', 'coin', 'paper'];
  var UNKNOWN = 8;
  var K = 9;

  function typeIndex(cardEnum) {
    if (cardEnum >= 1 && cardEnum <= 8) return cardEnum - 1;
    if (cardEnum === 0) return UNKNOWN;
    return -1;
  }

  // Piece costs as card enums.
  var PieceCost = {};
  PieceCost[Piece.Road] = [Card.Lumber, Card.Brick];
  PieceCost[Piece.Ship] = [Card.Lumber, Card.Wool];
  PieceCost[Piece.Settlement] = [Card.Lumber, Card.Brick, Card.Wool, Card.Grain];
  PieceCost[Piece.City] = [Card.Grain, Card.Grain, Card.Ore, Card.Ore, Card.Ore];
  PieceCost[Piece.CityWall] = [Card.Brick, Card.Brick];
  var DevCardCost = [Card.Wool, Card.Grain, Card.Ore];
  var KnightCost = [Card.Wool, Card.Ore];
  var KnightActivateCost = [Card.Grain];
  var ImprovementCommodity = {};
  ImprovementCommodity[Improvement.Trade] = Card.Cloth;
  ImprovementCommodity[Improvement.Politics] = Card.Coin;
  ImprovementCommodity[Improvement.Science] = Card.Paper;

  // playerStates[color].victoryPointsState is a map { vpType: count }.
  var VPType = {
    Settlement: 0, City: 1, DevelopmentCardVictoryPoint: 2, LargestArmy: 3, LongestRoad: 4,
    Chits: 5, Metropolis: 6, DefenderOfColonist: 7, ProgressCardVictoryPoint: 8, Merchant: 9
  };
  var VPValue = { 0: 1, 1: 2, 2: 1, 3: 2, 4: 2, 5: 1, 6: 2, 7: 1, 8: 1, 9: 1 };
  var VPPrivate = { 2: true, 8: true };

  // Development deck composition (base game / 5-6 player extension).
  function devDeck(playerCount) {
    if (playerCount > 4) {
      return { 11: 20, 12: 5, 13: 3, 14: 3, 15: 3 };
    }
    return { 11: 14, 12: 5, 13: 2, 14: 2, 15: 2 };
  }

  return {
    GameMsg: GameMsg,
    Log: Log,
    Card: Card,
    Piece: Piece,
    Distribution: Distribution,
    Improvement: Improvement,
    Mode: Mode,
    Color: Color,
    ColorHex: ColorHex,
    TYPES: TYPES,
    TYPE_NAMES: TYPE_NAMES,
    UNKNOWN: UNKNOWN,
    K: K,
    typeIndex: typeIndex,
    PieceCost: PieceCost,
    DevCardCost: DevCardCost,
    KnightCost: KnightCost,
    KnightActivateCost: KnightActivateCost,
    ImprovementCommodity: ImprovementCommodity,
    VPType: VPType,
    VPValue: VPValue,
    VPPrivate: VPPrivate,
    devDeck: devDeck
  };
})();
