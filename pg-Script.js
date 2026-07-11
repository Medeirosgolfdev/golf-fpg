(function(window, undefined) {
    var _ = window.gbox;
    var $ = _.query;

    _.extend(true, {
        global: {
            options: {
                standardWidth          : 720,
                hideLanguageMenu       : false,
                shareFacebook          : true,
                shareTwitter           : true,
                shareGoogle            : true,
                showNavIcons           : true,
                showEntry              : true,
                showSubNavOnTop        : true,

                hideExcelButton        : true,

                hideTinyProgressBar    : false,
                firstnameUppercase     : false,
                lastnameUppercase      : true,
                lastnameFirst: true,
                logoPictureWidth       : 300,
                logoPictureHeight      : 100,
                showFlipIcon           : true,

                itemHeight: 25,
                itemHeightExtended: 31,
                scorecardHeight: 154,

                columnWidthNationality: 22,
                columnWidthCountryName: 100,
                columnWidthClubName: 100,
                columnWidthHCP: 50,
                columnWidthPHCP: 50,
                columnWidthMemberID: 90,
                columnWidthClassName: 100,
                columnWidthTeamName: 100,
                columnWidthPlayerStatus: 100,
                columnWidthHCPStatus: 50,
                columnWidthCompanyName: 155,
                columnWidthWagr: 40,
                columnWidthWr4gd: 40,
                columnWidthBirthYear: 60,

                listPaddingSides: 20 // The total padding in the sides of a list
            }
        },

        pageleaderboard: {
            options: {
                countDownSeconds             : 90,
                width                        : 698,

                columnWidthHighlight         : 22,
                columnWidthPos               : 30,
                columnWidthPosChange         : 35,
                columnWidthPosChangeHolder   : 10,
                columnWidthOOMRank           : 30,
                columnWidthWagr              : 40,
                columnWidthWr4gd             : 40,
                columnWidthBirthYear         : 60,
                columnWidthChange            : 30,
                columnWidthNationality       : 22,
                columnWidthClubName          : 155,
                columnWidthScoringToPar      : 150,
                columnWidthScoringToParToPar : 50,
                columnWidthScoringToParHole  : 50,
                columnWidthScoringToParToDay : 50,
                columnWidthRoundsItem        : 27,
                columnWidthTotal             : 49,
                columnWidthCompanyName       : 100,

                inclColumnHighlight          : true,
                inclColumnPos                : true,
                inclColumnPosChange          : true,
                inclColumnOOMRank            : true,
                inclColumnWagr               : true,
                inclColumnWr4gd              : true,
                inclColumnBirthYear          : true,
                inclColumnChange             : false,
                inclColumnNationality        : true,
                inclColumnPlayerName         : true,
                inclColumnClubName           : true,
                inclColumnScoringToPar       : true,
                inclColumnRounds             : true,
                inclColumnTotal              : true,
                inclCompanyName              : false,

                visibilityOverrides: {
                    small: [
                        'scoringToPar.hole'
                    ]
                },

                entryPictureWidth            : 91,
                entryPictureHeight           : 91,
                scorecard:{
                    columnWidthText       : 35,
                    columnWidthSpacer     : 13,
                    columnWidthHoleSpace  : 10,
                    columnWidthHoleItem   : 22,
                    columnWidthHoleOutIn  : 38,
                    columnWidthHoleTotal  : 35
                }
            }
        },

        pageholebyhole: {
            options: {
                countDownSeconds     : 90,
                width                : 698,

                columnWidthHighlight : 22,
                columnWidthPos       : 30,
                columnWidthHoleSpace : 10,
                columnWidthHoleItem  : 20,
                columnWidthHoleOutIn : 35,
                columnWidthHoleTotal : 35,
                columnWidthTTP       : 35,
                columnWidthMatchNo   : 30,
                columnMinWidthName   : 100, // Both player name and team name

                inclColumnMatchNo    : true,
                inclColumnHighlight  : true,
                inclColumnPos        : true,
                inclColumnPlayerName : true,
                inclColumnTTP        : true
            }
        },

       pageresults: {
            options: {
                countDownSeconds             : 90,
                width                        : 698,

                columnWidthHighlight         : 22,
                columnWidthPos               : 30,
                columnWidthWagr              : 40,
                columnWidthWr4gd             : 40,
                columnWidthBirthYear         : 60,
                columnWidthChange            : 30,
                columnWidthNationality       : 22,
                columnWidthClubName          : 155,
                columnWidthScoringToParToPar : 50,
                columnWidthRoundsItem        : 27,
                columnWidthTotal             : 49,
                columnWidthPrize             : 75,
                columnWidthEndPadding        : 4,
                columnWidthCompanyName       : 100,

                inclColumnHighlight          : true,
                inclColumnPos                : true,
                inclColumnWagr               : true,
                inclColumnWr4gd              : true,
                inclColumnBirthYear          : true,
                inclColumnChange             : false,
                inclColumnNationality        : true,
                inclColumnPlayerName         : true,
                inclColumnClubName           : true,
                inclColumnScoringToPar       : true,
                inclColumnRounds             : true,
                inclColumnTotal              : true,
                inclColumnPrize              : true,
                inclColumnEndPadding         : true,
                inclColumnCompanyName        : false,

                entryPictureWidth            : 91,
                entryPictureHeight           : 91,
                scorecard:{
                    columnWidthText       : 35,
                    columnWidthSpacer     : 13,
                    columnWidthHoleSpace  : 10,
                    columnWidthHoleItem   : 22,
                    columnWidthHoleOutIn  : 38,
                    columnWidthHoleTotal  : 35
                }
            }
        },


       pagecompleteteamscorecard: {
            options: {
                width                        : 698,

                columnWidthHoleText          : 115,
                columnWidthSpacer            : 10,
                columnWidthHoleItem          : 26,
                columnWidthHoleSpace         : 12,
                columnWidthHoleOutIn         : 40,
                columnWidthHoleTotal         : 43,
                useLongerPlayerNames         : true  
            }
        },


        pagecompletescorecard: {
            options: {
                width                        : 698,

                columnWidthHoleText          : 50,//50
                columnWidthSpacer            : 10,
                columnWidthHoleItem          : 27,//28
                columnWidthHoleSpace         : 12,//12
                columnWidthHoleOutIn         : 35,//40
                columnWidthHoleTotal         : 40,//43

                widgetwidth                  : 330,
                columnWidthScoringAvgPlayer  : 65,
                columnWidthScoringAvgtext    : 60,

                columnWidthStatsScore        : 65,
                columnWidthStatsValue        : 60,

                entryPictureWidth            : 91,
                entryPictureHeight           : 91,


                chart:{
                    alternativPlotbandColor     : '#ececec',
                    plotlineColor               : '#b0b6ba',
                    plotlineWidth               : 1,
                    lineargradientEndY          : 220,
                    lineargradientStartColor    : '#f6f8f9',
                    lineargradientEndColor      : '#ffffff',
                    borderRadius: 0,
                    height: 220,
                    spacingBottom: 10,
                    spacingLeft: 10,
                    spacingRight: 10,
                    spacingTop: 10,
                    tooltipLineargradientEndY          : 50,
                    tooltipLineargradientStartColor    : 'rgba(245, 247, 248, .9)',
                    tooltipLineargradientEndColor      : 'rgba(255, 255, 255, .9)',
                    tooltipBorderColor                 : '#999999',
                    tooltipBorderRadius                : 0,
                    tooltipBorderWidth                 : 1,
                    tooltipColor                       : '#454545',
                    tooltipFontSize                    : '10px',
                    plotColor                          : '#aa0e0e',
                    plotLineWidth                      : 1,
                    plotRadius                         : 3,
                    plotHoverFillColor                 : '#ff1a1a',
                    plotHoverLineColor                 : '#aa0e0e',
                    plotHoverRadius                    : 4,
                    plotSymbol                         : 'circle',
                    xAxisStaggerLines                  : 1,
                    xAxisColor                         : '#454545',
                    xAxisFontSize                      : '10px',
                    xAxisFontWeight                    : 'bold',
                    xAxisLineColor                     : '#b0b6ba',
                    xAxisLineWidth                     : 1,
                    xAxisTickColor                     : '#b0b6ba',
                    xAxisTickInterval                  : 1,
                    xAxisTickLength                    : 4,
                    xAxisTickmarkPlacement             : 'on',
                    yAxisAllowDecimals                 : false,
                    yAxisGridLineColor                 : '#b0b6ba',
                    yAxisGridLineWidth                 : 1,
                    yAxisColor                         : '#454545',
                    yAxisFontSize                      : '10px',
                    yAxisFontWeight                    : 'bold',
                    yAxisLabelsSpacing                 : 12,
                    yAxisLineColor                     : '#b0b6ba',
                    yAxisLineWidth                     : 1,
                    yAxisTickColor                     : '#b0b6ba',
                    yAxisTickLength                    : 6,
                    yAxisTickWidth                     : 1,
                    yAxisPlotLinesColor                : '#454545',
                    yAxisPlotLinesWidth                : 1
                }
            }
        },

        matchplayshared: { // KJ 2016-06-06 - The idea here is that the options that apply to more than one page can be gathered in a shared options object. This does not include the 'inclColumn..' options, as these are set by the livescoring settings. If any page needs to override an option, it will have it on its own as well. A helper function will then retrieve the option from the page's own options object, and fall back to the shared object if the page does not have anything defined for this option. This idea can be fully implemented along with the LESS implementation
            options: {
                columnWidthMatchNo: 45,
                columnWidthEntryPicture: 60,
                columnWidthResult: 40,
                columnWidthResultManual: 130,
                columnWidthHoles: 45,

                columnMinWidthCompetitorName: 100, // Used on the scorecard

                entryPictureWidth: 58,
                entryPictureHeight: 58,

                scorecardwidth: 676,

                columnWidthHoleText: 24,
                columnWidthHoleItem: 30,
                columnWidthHoleSpace: 10,

                arrowMaxWidths: {
                    large: 150,
                    medium: 50,
                    small: 0
                }
            }
        },

        pagematchplay: {
            options: {
                countDownSeconds        : 90,
                width                   : 718,

                hideMatchplayNavigation : false,

                navigationArrowTail : 7,
                navigationArrowTip  : 9,

                inclNationality         : true,
                inclColumnEntryPicture  : true
            }
        },

        pagebracket: {
            options: {
                countDownSeconds             : 90,
                width                        : 708,
                teetimeHeight                : 18,
                battleviewMargin             : 10,
                headerTotalPadding           : 10,

                small:{
                    playerDistanceSpaceY         : 30,
                    playerDistanceSpaceX         : 10,
                    playerItemWidth              : 66,
                    playerItemHeight             : 20,
                    matchStatusHeight            : 20,
                    showMaxRounds                : 8
                },
                medium:{
                    playerDistanceSpaceY         : 30,
                    playerDistanceSpaceX         : 10,
                    playerItemWidth              : 130,
                    playerItemHeight             : 20,
                    matchStatusHeight            : 20,
                    columnWidthNationality       : 22,
                    inclColumnNationality        : true,
                    showMaxRounds                : 4

                },
                large:{
                    finale:{
                        playerItemWidth              : 141,
                        playerItemHeight             : 190,
                        inclColumnNationality        : true,
                        inclColumnClubName           : true,
                        inclColumnEntryPicture       : true,
                        columnWidthEntryPicture      : 141,
                        entryPictureWidth            : 141,
                        entryPictureHeight           : 141
                    },
                    winner:{
                        playerItemWidth              : 149,
                        playerItemHeight             : 280,
                        inclColumnNationality        : true,
                        inclColumnClubName           : true,
                        inclColumnEntryPicture       : true,
                        columnWidthEntryPicture      : 117,
                        entryPictureWidth            : 117,
                        entryPictureHeight           : 117
                        },
                    //ordinary rounds
                    backgroundPadding            : 10,
                    playerItemWidth              : 145,
                    playerItemHeight             : 45,
                    playerDistanceSpaceY         : 40,
                    playerDistanceSpaceX         : 28,
                    inclColumnNationality        : true,
                    inclColumnEntryPicture       : true,
                    columnWidthEntryPicture      : 45,
                    entryPictureWidth            : 45,
                    entryPictureHeight           : 45,
                    matchStatusHeight            : 20,
                    showMaxRounds                : 3
                }

            }
        },

        pagematchplayscorecard: {
            options: {
                width                   : 698,

                columnWidthRound             : 100,

                playerPictureWidth            : 91,
                playerPictureHeight           : 91,

                columnWidthResult       : 40,
                inclNationality         : true,
                inclColumnClubName      : true,
                inclColumnEntryPicture  : true,

                entryProfilePictureWidth     : 91,
                entryProfilePictureHeight    : 91
            }
        },

        pageteambracket: {
            options: {
                countDownSeconds             : 90,
                width                        : 708,
                teetimeHeight                : 18,
                paddingHeightPerTreebracket  : 40,
                finalRankingsPadding         : 50, // Padding in each side

                small:{
                    playerDistanceSpaceY         : 30,
                    playerDistanceSpaceX         : 10,
                    playerItemWidth              : 66,
                    playerItemHeight             : 20,
                    matchStatusHeight            : 20,
                    showMaxRounds                : 8
                },
                medium:{
                    playerDistanceSpaceY         : 30,
                    playerDistanceSpaceX         : 10,
                    playerItemWidth              : 130,
                    playerItemHeight             : 20,
                    matchStatusHeight            : 20,
                    columnWidthNationality       : 22,
                    columnWidthRank              : 30,
                    inclColumnNationality        : true,
                    showMaxRounds                : 4
                }
            }
        },

        pageteammatchscores: {
            options: {
                countDownSeconds        : 90,
                width                   : 714, //room for "padding:4" after the last col

                hideMatchplayNavigation : false,

                navigationWidth     : 718,
                navigationSpace     : 5,
                navigationPadding   : 10,
                navigationArrowTail : 7,
                navigationArrowTip  : 9,

                columnWidthDate         : 85,
                columnWidthStart        : 50,
                columnWidthNationality  : 22,
                columnWidthResult       : 82,

                columnWidthInterclubMatchNumber: 70,
                columnWidthInterclubRoundNumber: 70,

                inclDate                : true,
                inclColumnInterclubMatchNumber: true,
                inclColumnInterclubRoundNumber: true
            }
        },

        teammatchplayshared: {
            options: {
                columnWidthEntryPicture : 60,
                columnWidthResultManual : 130,

                entryPictureWidth       : 58,
                entryPictureHeight      : 58,

                arrowMaxWidths: {
                    large: 150,
                    medium: 50,
                    small: 0
                }
            }
        },

        pageroundrobin: {
            options: {
                countDownSeconds        : 90,
                width                   : 698,

                columnWidthPos          : 30,
                columnWidthPlayed       : 40,
                columnWidthWon          : 40,
                columnWidthTied         : 40,
                columnWidthLost         : 40,
                columnWidthScore        : 80,
                columnWidthPts          : 40,
                columnWidthDecision     : 40,

                matchOverviewWidth      : 714,  //room for "padding:4" after the last col

                columnWidthDate         : 85,
                columnWidthStart        : 50,
                columnWidthNationality  : 22,
                columnResultWidths: {
                    small: 60,
                    large: 82 // Large covers medium as well
                },

                columnWidthInterclubMatchNumber: 70,
                columnWidthInterclubRoundNumber: 70,

                inclDate                : true,
                inclColumnInterclubMatchNumber: true,
                inclColumnInterclubRoundNumber: true
            }
        },

        pageteammatch: {
            options: {
                countDownSeconds        : 90,
                width                   : 708,
                teamHeaderWidth         : 718,

                inclScoreBorder         : true, //border around the totalscoreheader
                columnWidthColor        : 10,
                columnWidthScore        : 50,
                columnWidthText         : 72,
                columnWidthNationality  : 22,
                inclNationality         : true,

                columnWidthMatchNo      : 45,
                columnWidthResult       : 40,
                columnWidthResultWide   : 60, // Used when the result column needs to be wider
                columnWidthHoles        : 45,

                inclColumnEntryPicture  : true
            }
        },

        pageteammatchscorecard: {
            options: {
                width                   : 698,

                columnWidthHoleText          : 24,
                columnWidthHoleItem          : 30,
                columnWidthHoleSpace         : 10,

                columnMinWidthCompetitorName : 100, // Used on the scorecard

                playerPictureWidth            : 91,
                playerPictureHeight           : 91,

                columnWidthMatchNo      : 45,
                columnWidthResult       : 40,
                columnWidthResultWide   : 60, // Used when the result column needs to be wider
                columnWidthHoles        : 45,
                inclNationality         : true,
                inclColumnClubName      : true,
                inclColumnEntryPicture  : true,

                entryProfilePictureWidth     : 91,
                entryProfilePictureHeight    : 91
            }
        },

        pagebuddycup: {
            options: {
                countDownSeconds: 90,
                width: 698,

                columnWidthPos: 30,
                columnWidthPlayed: 40,
                columnWidthWon: 40,
                columnWidthTied: 40,
                columnWidthLost: 40,
                columnWidthScore: 80,
                columnWidthHolesWon: 40,
                columnWidthHolesLost: 40,
                columnWidthPts: 40,
                columnWidthDecision: 40,
                columnMinWidthTeamName: 100,

                matchOverviewWidth: 714,  //room for "padding:4" after the last col

                columnWidthDate: 85,
                columnWidthStart: 50,
                columnWidthNationality: 22,
                columnResultWidths: {
                    small: 60,
                    large: 82 // Large covers medium as well
                },

                inclDate: true
            }
        },

        teamcupshared: {
            options: {
                columnWidthMatchNo: 45,
                columnWidthEntryPicture: 60,
                columnWidthResult: 40,
                columnWidthHoles: 45,

                entryPictureWidth: 58,
                entryPictureHeight: 58,

                arrowMaxWidths: {
                    large: 150,
                    medium: 50,
                    small: 0
                }
            }
        },

        pageteamcup: {
            options: {
                countDownSeconds        : 90,
                width                   : 708,
                teamHeaderWidth         : 718,

                inclScoreBorder         : true, //border around the totalscoreheader
                columnWidthColor        : 10,
                columnWidthScore        : 50,
                columnWidthText         : 72,

                roundHeaderWidth        : 763,

                inclNationality         : true,
                inclColumnClubName      : true,
                inclColumnEntryPicture  : true
            }
        },

        pageteamcupscorecard: {
            options: {
                width                   : 698,

                columnWidthHoleText          : 24,
                columnWidthHoleItem          : 30,
                columnWidthHoleSpace         : 10,

                columnMinWidthCompetitorName : 100, // Used on the scorecard

                playerPictureWidth            : 91,
                playerPictureHeight           : 91,

                inclNationality         : true,
                inclColumnClubName      : true,
                inclColumnEntryPicture  : true,

                entryProfilePictureWidth     : 91,
                entryProfilePictureHeight    : 91
            }
        },


        pageteetimes: {
            options: {
                width                  : 698,

                columnWidthMatchNo     : 40,
                columnWidthStartTime   : 60,
                columnWidthHole        : 40,
                columnWidthNationality : 32,
                columnWidthHCP         : 50,
                columnWidthTee         : 65,
                columnWidthVenueName   : 150,

                inclColumnMatchNo      : true,
                inclColumnStartTime    : true,
                inclColumnTeam         : true,
                inclColumnHole         : true,
                inclColumnNationality  : true,
                inclColumnPlayerName   : true,
                inclColumnClubName     : true,
                inclColumnHCP          : true,
                inclColumnTee          : true,
                inclColumnVenueName    : true,
                inclColumnWagr         : true,
                inclColumnWr4gd        : true,
                inclColumnBirthYear    : true,

                allowTeamRows          : true
            }
        },

        pagecoursestats: {
            options: {
                countDownSeconds       : 90,
                width                  : 698,

                columnWidthHole        : 64,
                columnWidthPar         : 64,
                columnWidthBruttoAvg   : 85,
                columnWidthRank        : 80,
                columnWidthNoOfEagle   : 80,
                columnWidthNoOfBirdie  : 80,
                columnWidthNoOfPar     : 80,
                columnWidthNoOfBogie   : 80,
                columnWidthNoOfDBogey  : 80,
                columnMinWidth         : 45,

                inclColumnHole         : true,
                inclColumnPar          : true,
                inclColumnBruttoAvg    : true,
                inclColumnRank         : true,
                inclColumnNoOfEagle    : true,
                inclColumnNoOfBirdie   : true,
                inclColumnNoOfPar      : true,
                inclColumnNoOfBogie    : true,
                inclColumnNoOfDBogey   : true
            }
        },

        pageplayerstats: {
            options: {
                countDownSeconds             : 90,
                width                        : 719,
                listwidth                    : 350,
                columnWidthPos               : 30,
                columnWidthClubName          : 135,
                columnWidthCountry           : 135,
                columnWidthScore             : 45,
                columnWidthNumber            : 45,
                columnWidthPicture           : 38,

                inclColumnPos                : true,
                inclColumnClubName           : false, //only one of country and clubname should be true
                inclColumnCountry            : true,
                inclColumnScore              : true,
                inclColumnNumber             : true,
                inclColumnPicture            : true,

                entryPictureWidth            : 28,
                entryPictureHeight           : 28

            }
        },

        pagecompleteplayerstats: {
            options: {
                countDownSeconds             : 90,
                width                        : 698,
                columnWidthPos               : 30,
                columnWidthClubName          : 155,
                columnWidthCountry           : 155,
                columnWidthScore             : 60,
                columnWidthNumber            : 60,

                inclColumnPos                : true,
                inclColumnPlayerName         : true,
                inclColumnClubName           : true,
                inclColumnCountry            : true,
                inclColumnScore              : true,
                inclColumnNumber             : true

            }
        },

        pageschedule: {
            options: {
                width                        : 698,
                columnWidthDate              : 80,

                inclColumnDate               : true,
                inclColumnCompetitionName    : true

            }
        },

        pageorderofmerits: {
            options: {
                width                        : 702,

                inclColumnOrderOfMerit       : true
            }
        },

        orderofmeritshared: {
            options: {
                columnWidthPos: 35,
                columnWidthNationality: 22,

                columnMinWidthName: 100, // Used in eclectic and orderofmeritrounds

                columnResultWidths: {
                    small: 50,
                    large: 100
                },

                inclColumnPos: true,
                inclColumnResult: true,
                inclColumnName: true
            }
        },

        pageorderofmerit: {
            options: {
                width                        : 698,
                columnWidthMemberID          : 70,
                columnWidthBirthYear         : 60,
                columnWidthEvents            : 50,
                columnMinWidthClubName       : 100, // Only used in eclectic

                //inclColumnNationality        : true,
                inclColumnEvents             : true
            }
        },

        pageorderofmeritrounds: {
            options: {
                columnWidthRoundsItem: 75,

                inclColumnRounds: true
            }
        },

        pageorderofmeritplayer: {
            options: {
                width                        : 698,
                columnWidthIsCounting        : 22,
                columnWidthPos               : 30,
                columnWidthDate              : 70,
                columnWidthResultCategory    : 60,
                columnMinWidthCompetition    : 150, // Only used in eclectic
                columnResultWidths: {
                    small: 50,
                    large: 140
                },

                inclColumnIsCounting         : true,
                inclColumnPos                : true,
                inclColumnDate               : true,
                inclColumnResultCategory     : true,
                inclColumnResult             : true,
                inclColumnCompetition        : true,

                entryPictureWidth            : 91,
                entryPictureHeight           : 91

            }
        },

        pageplayers: {
            options: {
                width                     : 698,
                expandedPlayersWidth      : 677,

                columnWidthRowNo          : 25,
                columnWidthReserveListNo  : 20,
                columnWidthEntryStatus    : 100,
                columnWidthNationality    : 32,
                columnWidthHCP            : 50,
                columnWidthWagr           : 40,
                columnWidthWr4gd          : 40,
                columnWidthBirthYear      : 60,
                columnWidthPlayerCategory : 80,

                inclColumnRowNo           : true,
                inclColumnWagr            : true,
                inclColumnWr4gd           : true,
                inclColumnBirthYear       : true,
                inclColumnReserveListNo   : true,
                inclColumnEntryStatus     : true,
                inclColumnNationality     : true,
                inclColumnFirstName       : true,
                inclColumnLastName        : true,
                inclColumnClubName        : true,
                inclColumnTeam            : true,
                inclColumnHCP             : true
            }
        },

        pageinfo: {
            options: {
                columnHeaderWidth      : 340,
                columnWidth            : 318,
                columnEntryLabel         : 125,
                columnEntryFeeLabel      : 125,
                columnVenueLabel         : 100,
                columnRoundsLabel        : 110,
                columnContactsLabel      : 100,
                columnClassesLabel       : 170,
                columnOrderOfMeritsLabel : 25,
                columnOrderOfMeritsCont  : 150,
                columnCutsLabel          : 150,
                columnDecisionsLabel     : 100,

                columnHeightGoogleMap  : 375,
                inclGoogleMap          : true
            }
        },

        pagesponsors: {
            options: {
                width                : 718,

                logoPictureWidth    : 195,
                logoPictureHeight   : 65

            }
        },

        pagecourseinfo: {
            options: {
                columnHeaderWidth: 699,
                columnWidth: 677
            }
        },

        pageinterclubtournaments: {
            options: {
                width: 698,
                inclColumnTournamentName: true
            }
        },

        pageoverview: {
            options: {
                width: 698,
                columnDivisionNameWidths: {
                    small: 100,
                    large: 185
                },

                inclColumnDivisionName: true,
                inclColumnPool: true
            }
        },

        pagematchschedule: {
            options: {
                width: 698,
                columnWidthDate: 90,
                columnWidthTeams: 180,
                columnWidthScore: 80,
                columnWidthScoreContent: 50,
                columnWidthHostingClub: 200,
                columnWidthMatchNumber: 60,

                inclColumnDate: true,
                inclColumnTeams: true,
                inclColumnScore: true,
                inclColumnHostingClub: true,
                inclColumnMatchNumber: true
            }
        },

        pagecontactinfo: {
            options: {
                columnHeaderWidth: 699,
                columnWidth: 677,
                columnMobileNoWidths: {
                    small: 80,
                    large: 130
                }
            }
        },

        pageinterclubinfo: {
            options: {}
        },

        pageranking: {
            options: {
                width: 698,
                columnWidthPos: 50,
                columnWidthUps: 60,
                columnWidthDowns: 60,
                columnWidthTieBreaker: 120,
                columnMatchPointsWidths: {
                    small: 70,
                    large: 100
                },

                inclColumnPos: true,
                inclColumnMatchPoints: true,
                inclColumnUps: true,
                inclColumnDowns: true,
                inclColumnTieBreaker: true,
            }
        },

        pagebirdiebogeystreaks: {
            options: {
                width                : 180,

                columnWidthPaddings     : 32, //padding and borders
                columnWidthEntryPicture : 28,
                columnWidthStreaks      : 54,

                entryPictureWidth            : 26,
                entryPictureHeight           : 26,

                inclColumnEntryPicture  : true
            }
        },
        pagetopxleaderboard: {
            options: {
                width                : 180,

                columnWidthPaddings    : 22, //padding and borders
                columnWidthPos         : 20,
                columnWidthNationality : 20,
                columnWidthToPar       : 25,
                columnWidthHole        : 25,

                inclColumnPos         : true,
                inclColumnNationality : true,
                inclColumnToPar       : true,
                inclColumnHole        : true
            }
        },
        pagebiggestmovers: {
            options: {
                width: 190,

                columnWidthPaddings: 32, //padding and borders
                columnWidthEntryPicture: 28,
                columnWidthChange: 30,

                entryPictureWidth: 26,
                entryPictureHeight: 26,

                inclColumnEntryPicture: true
            }
        },
        pagetopxorderofmerit: {
            options: {
                width: 200,

                columnWidthPaddings: 22, //padding and borders
                columnWidthPos: 20,
                columnWidthResult: 40,

                inclColumnPos: true,
                inclColumnResult: true
            }
        },
        pageowgr: {
            options: {
                hideTheme: true
            }
        }
    });
})(window);