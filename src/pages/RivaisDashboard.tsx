/**
 * RivaisDashboard.tsx — golf-dashboard.jsx adaptado ao design system da app
 * + QDL Junior Open 2025 + Greatgolf Junior Open 2026
 */
import { useState, useMemo } from "react";
import { sc3m, SC } from "../utils/scoreDisplay";

const FL={"Portugal":"🇵🇹","Spain":"🇪🇸","England":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Russian Federation":"🇷🇺","Bulgaria":"🇧🇬","Switzerland":"🇨🇭","Italy":"🇮🇹","France":"🇫🇷","Ireland":"🇮🇪","Northern Ireland":"🇬🇧","Germany":"🇩🇪","Netherlands":"🇳🇱","Norway":"🇳🇴","Lithuania":"🇱🇹","Thailand":"🇹🇭","United States":"🇺🇸","United Kingdom":"🇬🇧","Sweden":"🇸🇪","Morocco":"🇲🇦","Wales":"🏴󠁧󠁢󠁷󠁬󠁳󠁿","Belgium":"🇧🇪","Slovenia":"🇸🇮","Ukraine":"🇺🇦","Romania":"🇷🇴","China":"🇨🇳","Philippines":"🇵🇭","Slovakia":"🇸🇰","United Arab Emirates":"🇦🇪","Turkey":"🇹🇷","India":"🇮🇳","Viet Nam":"🇻🇳","Kazakhstan":"🇰🇿","Hungary":"🇭🇺","South Africa":"🇿🇦","Singapore":"🇸🇬","Denmark":"🇩🇰","Mexico":"🇲🇽","Canada":"🇨🇦","Austria":"🇦🇹","Paraguay":"🇵🇾","Brazil":"🇧🇷","Jersey":"🇯🇪","Nigeria":"🇳🇬","Oman":"🇴🇲","Chile":"🇨🇱","Colombia":"🇨🇴","Puerto Rico":"🇵🇷","Costa Rica":"🇨🇷","Great Britain":"🇬🇧","Latvia":"🇱🇻","South Korea":"🇰🇷"};

const T=[
  {id:"brjgt25",name:"WJGC 2025",short:"WJGC",date:"Fev 2025",rounds:3,par:71,url:"https://brjgt.bluegolf.com/bluegolf/brjgt25/event/brjgt251/contest/34/leaderboard.htm"},
  {id:"eowagr25",name:"European Open",short:"EU Open",date:"Ago 2025",rounds:3,par:72,url:"https://brjgt.bluegolf.com/bluegolfw/brjgt25/event/brjgt2512/contest/21/leaderboard.htm"},
  {id:"venice25",name:"Venice Open 2025",short:"Venice",date:"Ago 2025",rounds:3,par:72,url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/515206/venice-open-2025/results"},
  {id:"rome25",name:"Rome Classic 2025",short:"Rome",date:"Out 2025",rounds:2,par:72,url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516026/rome-classic-2025/results"},
  {id:"doral25",name:"Doral Junior 2025",short:"Doral",date:"Dez 2025",rounds:2,par:71,url:"https://www.golfgenius.com/v2tournaments/4222407?called_from=widgets%2Fcustomized_tournament_results&hide_totals=false&player_stats_for_portal=true"},
  {id:"qdl25",name:"QDL Junior Open 2025",short:"QDL",date:"Nov 2025",rounds:1,par:72},
  {id:"gg26",name:"International kids",short:"GG",date:"Fev 2026",rounds:1,par:72},
];

const UP=[{id:"wjgc26",name:"WJGC 2026",short:"WJGC"},{id:"marco26",name:"Marco Simone Inv.",short:"M.SIMONE",url:"https://tournaments.uskidsgolf.com/tournaments/international/find-tournament/516989/marco-simone-invitational-2026/field"}];

const D=[
  {n:"Manuel Medeiros",co:"Portugal",isM:true,r:{brjgt25:{p:26,t:265,tp:52,rd:[90,85,90]},eowagr25:{p:7,t:238,tp:22,rd:[85,77,76]},venice25:{p:28,t:237,tp:21,rd:[78,76,83]},rome25:{p:10,t:166,tp:22,rd:[89,77]},doral25:{p:29,t:177,tp:35,rd:[98,79]},qdl25:{p:11,t:90,tp:18,rd:[90]},gg26:{p:4,t:87,tp:15,rd:[87]}},up:["wjgc26","marco26"]},
  {n:"Dmitrii Elchaninov",co:"Russian Federation",r:{brjgt25:{p:1,t:205,tp:-8,rd:[69,68,68]},eowagr25:{p:2,t:218,tp:2,rd:[77,70,71]},venice25:{p:1,t:198,tp:-18,rd:[62,68,68]},qdl25:{p:1,t:71,tp:-1,rd:[71]}},up:["wjgc26"]},
  {n:"Diego Gross Paneque",co:"Spain",r:{brjgt25:{p:16,t:249,tp:36,rd:[80,84,85]}},up:["wjgc26"]},
  {n:"Álex Carrón",co:"Spain",r:{brjgt25:{p:13,t:246,tp:33,rd:[82,84,80]}},up:["wjgc26"]},
  {n:"Henry Liechti",co:"Switzerland",r:{brjgt25:{p:17,t:250,tp:37,rd:[87,84,79]}},up:["wjgc26"]},
  {n:"Niko Alvarez Van Der Walt",co:"Spain",r:{brjgt25:{p:22,t:261,tp:48,rd:[89,83,89]}},up:["wjgc26"]},
  {n:"Miroslavs Bogdanovs",co:"Spain",r:{brjgt25:{p:24,t:263,tp:50,rd:[86,88,89]},venice25:{p:18,t:227,tp:11,rd:[76,74,77]}},up:["wjgc26"]},
  {n:"Christian Chepishev",co:"Bulgaria",r:{brjgt25:{p:29,t:270,tp:57,rd:[87,86,97]}},up:["wjgc26","marco26"]},
  {n:"James Doyle",co:"Ireland",r:{brjgt25:{p:32,t:277,tp:64,rd:[93,92,92]}},up:["wjgc26"]},
  {n:"Alexis Beringer",co:"Switzerland",r:{brjgt25:{p:33,t:290,tp:77,rd:[93,94,103]}},up:["wjgc26"]},
  {n:"Kevin Canton",co:"Italy",r:{brjgt25:{p:34,t:291,tp:78,rd:[98,96,97]}},up:["wjgc26"]},
  {n:"Leon Schneitter",co:"Switzerland",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]}},up:["wjgc26"]},
  {n:"Victor Canot Januel",co:"France",r:{brjgt25:{p:30,t:274,tp:61,rd:[88,88,98]},venice25:{p:24,t:233,tp:17,rd:[76,82,75]}},up:[]},
  {n:"Theodore Dausse",co:"France",r:{brjgt25:{p:31,t:275,tp:62,rd:[96,90,89]},venice25:{p:30,t:244,tp:28,rd:[83,80,81]}},up:[]},
  {n:"Aronas Juodis",co:"Lithuania",r:{brjgt25:{p:8,t:232,tp:19,rd:[74,77,81]},eowagr25:{p:1,t:213,tp:-3,rd:[72,71,70]},qdl25:{p:4,t:75,tp:3,rd:[75]}},up:[]},
  {n:"Marcus Karim",co:"England",r:{brjgt25:{p:2,t:218,tp:5,rd:[74,73,71]},qdl25:{p:3,t:72,tp:0,rd:[72]}},up:[]},
  {n:"Harrison Barnett",co:"England",r:{brjgt25:{p:3,t:220,tp:7,rd:[77,71,72]},qdl25:{p:6,t:78,tp:6,rd:[78]}},up:[]},
  {n:"Julian Sepulveda",co:"United States",r:{brjgt25:{p:4,t:223,tp:10,rd:[73,77,73]},doral25:{p:17,t:162,tp:20,rd:[81,81]}},up:[]},
  {n:"Mihir Pasura",co:"United Kingdom",r:{brjgt25:{p:5,t:229,tp:16,rd:[82,74,73]}},up:[]},
  {n:"Yorick De Hek",co:"Netherlands",r:{brjgt25:{p:28,t:270,tp:57,rd:[92,87,91]},eowagr25:{p:5,t:234,tp:18,rd:[79,76,79]}},up:[]},
  {n:"Nial Diwan",co:"England",r:{brjgt25:{p:25,t:264,tp:51,rd:[93,87,84]},eowagr25:{p:6,t:238,tp:22,rd:[81,84,73]}},up:[]},
  {n:"Maximilien Demole",co:"Switzerland",r:{venice25:{p:3,t:207,tp:-9,rd:[69,70,68]},doral25:{p:5,t:155,tp:13,rd:[80,75]}},up:[]},
  {n:"Emile Cuanalo",co:"England",r:{eowagr25:{p:3,t:224,tp:8,rd:[70,76,78]},venice25:{p:5,t:211,tp:-5,rd:[67,71,73]},rome25:{p:2,t:139,tp:-5,rd:[70,69]},qdl25:{p:5,t:75,tp:3,rd:[75]}},up:[]},
  {n:"Paul Berger",co:"Germany",r:{venice25:{p:5,t:211,tp:-5,rd:[70,70,71]},doral25:{p:10,t:158,tp:16,rd:[82,76]}},up:[]},
  {n:"Matteo Durando",co:"Italy",r:{venice25:{p:11,t:215,tp:-1,rd:[70,76,69]},doral25:{p:9,t:156,tp:14,rd:[79,77]}},up:["marco26"]},
  {n:"Luis Maier",co:"Germany",r:{venice25:{p:9,t:213,tp:-3,rd:[69,70,74]},doral25:{p:26,t:175,tp:33,rd:[88,87]}},up:[]},
  {n:"Emilio Berti",co:"Italy",r:{venice25:{p:10,t:214,tp:-2,rd:[73,68,73]},rome25:{p:1,t:136,tp:-8,rd:[70,66]}},up:[]},
  {n:"Noah Birk Andersen",co:"Denmark",r:{venice25:{p:22,t:230,tp:14,rd:[79,74,77]}},up:["marco26"]},
  {n:"Alexander Pianigiani",co:"Italy",r:{rome25:{p:7,t:157,tp:13,rd:[83,74]}},up:["marco26"]},
  {n:"Edoardo Lemonnier",co:"Italy",r:{rome25:{p:3,t:143,tp:-1,rd:[69,74]}},up:["marco26"]},
  {n:"Haqvin Sylven",co:"Switzerland",r:{rome25:{p:8,t:160,tp:16,rd:[82,78]}},up:["marco26"]},
  {n:"Kimi Pulga",co:"Italy",r:{venice25:{p:26,t:234,tp:18,rd:[78,81,75]}},up:["marco26"]},
  {n:"Hugo Strasser",co:"Switzerland",r:{},up:["wjgc26","marco26"]},
  {n:"Skyy Wilding",co:"Thailand",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]},venice25:{p:2,t:203,tp:-13,rd:[65,65,73]}},up:[]},
  {n:"Felipe Seferian",co:"Spain",r:{venice25:{p:4,t:209,tp:-7,rd:[67,70,72]}},up:[]},
  {n:"Nicolas Pape",co:"Thailand",r:{brjgt25:{p:6,t:231,tp:18,rd:[75,77,79]}},up:[]},
  {n:"Harry-James Odell",co:"England",r:{brjgt25:{p:7,t:231,tp:18,rd:[77,74,80]}},up:[]},
  {n:"Maxime Vervaet",co:"Spain",r:{brjgt25:{p:10,t:239,tp:26,rd:[83,77,79]}},up:[]},
  {n:"Henry Atkinson",co:"England",r:{brjgt25:{p:11,t:239,tp:26,rd:[77,79,83]}},up:[]},
  {n:"Kirill Sedov",co:"Russian Federation",r:{brjgt25:{p:15,t:247,tp:34,rd:[84,82,81]}},up:[]},
  {n:"Edward Fearnley",co:"England",r:{brjgt25:{p:14,t:246,tp:33,rd:[78,85,83]}},up:[]},
  {n:"Mauricio Mijares",co:"Mexico",r:{doral25:{p:1,t:148,tp:6,rd:[74,74]}},up:[]},
  {n:"Jean Imperiali De Francavilla",co:"France",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]},venice25:{p:23,t:231,tp:15,rd:[77,75,79]},rome25:{p:5,t:152,tp:8,rd:[77,75]}},up:[]},
  {n:"Sebastiano Giacobbi",co:"Italy",r:{venice25:{p:37,t:267,tp:51,rd:[95,87,85]},rome25:{p:13,t:173,tp:29,rd:[87,86]}},up:["marco26"]},
  {n:"Leo Egozi",co:"United States",r:{venice25:{p:36,t:252,tp:36,rd:[83,84,85]},rome25:{p:11,t:167,tp:23,rd:[82,85]}},up:[]},
  {n:"Joe Short",co:"Portugal",r:{gg26:{p:2,t:79,tp:7,rd:[79]}},up:["wjgc26"]},
  {n:"Madalena Miguel Araújo",co:"Portugal",r:{},up:["wjgc26"]},
  {n:"Elijah Gibbons",co:"England",r:{},up:["wjgc26"]},
  {n:"Harley Botham",co:"Northern Ireland",r:{gg26:{p:10,t:98,tp:26,rd:[98]}},up:["wjgc26"]},
  {n:"Benji Botham",co:"Northern Ireland",r:{gg26:{p:5,t:88,tp:16,rd:[88]}},up:["wjgc26"]},
  {n:"Roman Hicks",co:"England",r:{},up:["wjgc26"]},
  {n:"Hanlin Wang",co:"England",r:{},up:["wjgc26"]},
  {n:"Mario Valiente Novella",co:"Spain",r:{},up:["wjgc26"]},
  {n:"Aineon Hiram Jabonero",co:"Philippines",r:{},up:["wjgc26"]},
  {n:"David Dung Nguyen",co:"Viet Nam",r:{},up:["wjgc26"]},
  {n:"Maddox Tiemann",co:"Sweden",r:{},up:["wjgc26"]},
  {n:"William Harran",co:"Switzerland",r:{},up:["wjgc26"]},
  {n:"Louis Harran",co:"Switzerland",r:{},up:["wjgc26"]},
  {n:"Pietro Salvati",co:"Italy",r:{},up:["wjgc26"]},
  {n:"Erik Martel",co:"Spain",r:{brjgt25:{p:18,t:250,tp:37,rd:[83,79,88]}},up:[]},
  // BRJGT 2025 missing
  {n:"Hugo Luque Reina",co:"Spain",r:{brjgt25:{p:9,t:237,tp:24,rd:[78,77,82]}},up:[]},
  {n:"Daniel Avila Sanz",co:"Spain",r:{brjgt25:{p:12,t:240,tp:27,rd:[80,77,83]}},up:[]},
  {n:"Nicolas De La Torre Montoto",co:"Spain",r:{brjgt25:{p:19,t:252,tp:39,rd:[84,83,85]}},up:[]},
  {n:"Antonio Toledano Ibáñez-Aldecoa",co:"Spain",r:{brjgt25:{p:20,t:258,tp:45,rd:[82,91,85]}},up:[]},
  {n:"Johnny Marriott",co:"United Kingdom",r:{brjgt25:{p:21,t:260,tp:47,rd:[84,86,90]}},up:[]},
  {n:"Edward (Bear) Millar",co:"Jersey",r:{brjgt25:{p:23,t:263,tp:50,rd:[85,93,85]}},up:[]},
  {n:"Harvey Eastwood",co:"England",r:{brjgt25:{p:27,t:268,tp:55,rd:[86,85,97]}},up:[]},
  {n:"Jamie Murray",co:"Sweden",r:{brjgt25:{p:35,t:299,tp:86,rd:[109,99,91]}},up:[]},
  {n:"Borja Enriquez Sainz de la Flor",co:"Spain",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]}},up:[]},
  {n:"Lewis Ikeji Dandyson",co:"Nigeria",r:{brjgt25:{p:"WD",t:null,tp:null,rd:[]}},up:[]},
  {n:"Diego Mastrogiuseppe",co:"Italy",r:{rome25:{p:4,t:147,tp:3,rd:[74,73]}},up:[]},
  {n:"Andrea Capotosti",co:"Italy",r:{rome25:{p:6,t:154,tp:10,rd:[80,74]}},up:[]},
  {n:"Rocco Di Ciacca",co:"Great Britain",r:{rome25:{p:8,t:160,tp:16,rd:[83,77]}},up:[]},
  {n:"Leonardo Lopez",co:"Italy",r:{rome25:{p:12,t:171,tp:27,rd:[88,83]}},up:[]},
  // EO WAGR missing
  {n:"Maxwell Ip",co:"Netherlands",r:{eowagr25:{p:4,t:227,tp:11,rd:[73,79,75]}},up:[]},
  {n:"Muduo Wang",co:"China",r:{eowagr25:{p:8,t:262,tp:46,rd:[86,93,83]}},up:[]},
  // Venice Open missing
  {n:"Octavio Bailly",co:"France",r:{venice25:{p:5,t:211,tp:-5,rd:[68,75,68]}},up:[]},
  {n:"Arthur Lawson",co:"Brazil",r:{venice25:{p:5,t:211,tp:-5,rd:[73,69,69]}},up:[]},
  {n:"Federico Scorzoni",co:"Italy",r:{venice25:{p:12,t:216,tp:0,rd:[71,73,72]}},up:[]},
  {n:"Alfie Skinner",co:"Great Britain",r:{venice25:{p:13,t:217,tp:1,rd:[72,74,71]}},up:[]},
  {n:"Ben Pommer",co:"Germany",r:{venice25:{p:14,t:222,tp:6,rd:[75,71,76]}},up:[]},
  {n:"Wille Reis",co:"Sweden",r:{venice25:{p:14,t:222,tp:6,rd:[74,75,73]}},up:[]},
  {n:"Yusuf Al Rumhy",co:"Oman",r:{venice25:{p:16,t:226,tp:10,rd:[77,73,76]}},up:[]},
  {n:"Constantin Fritz",co:"Germany",r:{venice25:{p:16,t:226,tp:10,rd:[76,77,73]}},up:[]},
  {n:"Francesco Pacella",co:"Italy",r:{venice25:{p:18,t:227,tp:11,rd:[79,73,75]}},up:[]},
  {n:"Paul Perez",co:"France",r:{venice25:{p:18,t:227,tp:11,rd:[71,74,82]}},up:[]},
  {n:"Amiel Meisler",co:"France",r:{venice25:{p:21,t:229,tp:13,rd:[76,78,75]}},up:[]},
  {n:"Raphael Gozzo",co:"Italy",r:{venice25:{p:24,t:233,tp:17,rd:[79,79,75]}},up:[]},
  {n:"Felipe Tavares De Araujo",co:"Italy",r:{venice25:{p:27,t:235,tp:19,rd:[76,79,80]}},up:[]},
  {n:"Francesco Bellentani",co:"Italy",r:{venice25:{p:28,t:237,tp:21,rd:[79,79,79]}},up:[]},
  {n:"Roland Wochna",co:"Hungary",r:{venice25:{p:31,t:245,tp:29,rd:[83,76,86]}},up:[]},
  {n:"Noah Lobelius",co:"Sweden",r:{venice25:{p:32,t:246,tp:30,rd:[81,84,81]}},up:[]},
  {n:"Sami Vater",co:"Germany",r:{venice25:{p:32,t:246,tp:30,rd:[84,81,81]}},up:[]},
  {n:"Nikita Perini",co:"Italy",r:{venice25:{p:34,t:247,tp:31,rd:[82,83,82]}},up:[]},
  {n:"Welles Leano",co:"United States",r:{venice25:{p:35,t:251,tp:35,rd:[83,81,87]}},up:[]},
  {n:"Lapo Bavutti",co:"Italy",r:{venice25:{p:37,t:267,tp:51,rd:[85,87,95]},rome25:{p:14,t:174,tp:30,rd:[87,87]}},up:[]},
  {n:"Paul Renard",co:"France",r:{venice25:{p:39,t:292,tp:76,rd:[97,96,99]}},up:[]},
  // Doral Junior missing
  {n:"Victor Monssoh",co:"United States",r:{doral25:{p:2,t:152,tp:10,rd:[79,73]}},up:[]},
  {n:"Stephen Sanders",co:"United States",r:{doral25:{p:3,t:154,tp:12,rd:[76,78]}},up:[]},
  {n:"Ignacio Beaujon",co:"United States",r:{doral25:{p:4,t:154,tp:12,rd:[79,75]}},up:[]},
  {n:"Ethan Li",co:"United States",r:{doral25:{p:6,t:155,tp:13,rd:[78,77]}},up:[]},
  {n:"Alexander Heuberger",co:"United States",r:{doral25:{p:7,t:155,tp:13,rd:[79,76]}},up:[]},
  {n:"Pedro Araya",co:"Chile",r:{doral25:{p:8,t:155,tp:13,rd:[77,78]}},up:[]},
  {n:"Rivers Hood",co:"United States",r:{doral25:{p:11,t:158,tp:16,rd:[78,80]}},up:[]},
  {n:"Charlie Magee",co:"United States",r:{doral25:{p:12,t:159,tp:17,rd:[83,76]}},up:[]},
  {n:"Maxence Le Theo",co:"France",r:{doral25:{p:13,t:160,tp:18,rd:[83,77]}},up:[]},
  {n:"Matthew Schreibman",co:"United States",r:{doral25:{p:14,t:160,tp:18,rd:[79,81]}},up:[]},
  {n:"Bodie Patton",co:"United States",r:{doral25:{p:15,t:161,tp:19,rd:[80,81]}},up:[]},
  {n:"Paolo Yerena",co:"Mexico",r:{doral25:{p:16,t:162,tp:20,rd:[80,82]}},up:[]},
  {n:"Alfred Carmenate",co:"United States",r:{doral25:{p:18,t:166,tp:24,rd:[87,79]}},up:[]},
  {n:"Alejandro Gonzalez",co:"Mexico",r:{doral25:{p:19,t:167,tp:25,rd:[89,78]}},up:[]},
  {n:"Teddy Sullivan",co:"United States",r:{doral25:{p:20,t:167,tp:25,rd:[87,80]}},up:[]},
  {n:"Isak Lindstrom",co:"Costa Rica",r:{doral25:{p:21,t:167,tp:25,rd:[86,81]}},up:[]},
  {n:"John Sanabria",co:"United States",r:{doral25:{p:22,t:171,tp:29,rd:[88,83]}},up:[]},
  {n:"Aston Cruz",co:"United States",r:{doral25:{p:23,t:171,tp:29,rd:[82,89]}},up:[]},
  {n:"Nathan Khera",co:"Canada",r:{doral25:{p:24,t:172,tp:30,rd:[88,84]}},up:[]},
  {n:"William Murphy",co:"United States",r:{doral25:{p:25,t:174,tp:32,rd:[90,84]}},up:[]},
  {n:"Daniel Candon",co:"United States",r:{doral25:{p:27,t:176,tp:34,rd:[90,86]}},up:[]},
  {n:"Theo Dudley",co:"United States",r:{doral25:{p:28,t:176,tp:34,rd:[86,90]}},up:[]},
  {n:"Matteo Mair",co:"Austria",r:{doral25:{p:30,t:178,tp:36,rd:[88,90]}},up:[]},
  {n:"Pedro Restrepo",co:"Colombia",r:{doral25:{p:31,t:180,tp:38,rd:[89,91]}},up:[]},
  {n:"Thiago Marco Rodriguez",co:"Puerto Rico",r:{doral25:{p:32,t:181,tp:39,rd:[89,92]}},up:[]},
  {n:"Mateo Conde",co:"United States",r:{doral25:{p:33,t:187,tp:45,rd:[100,87]}},up:[]},
  {n:"William Saldana",co:"United States",r:{doral25:{p:34,t:217,tp:75,rd:[110,107]}},up:[]},
  {n:"Nikola Kitic",co:"United States",r:{doral25:{p:35,t:306,tp:164,rd:[144,162]}},up:[]},
  {n:"Oliver Smith",co:"United Kingdom",r:{qdl25:{p:2,t:72,tp:0,rd:[72]}},up:[]},
  {n:"Afonso de Sousa Pinto",co:"Portugal",r:{qdl25:{p:7,t:78,tp:6,rd:[78]}},up:[]},
  {n:"Marcos Ledesma",co:"Spain",r:{qdl25:{p:8,t:78,tp:6,rd:[78]}},up:[]},
  {n:"Francisco Carvalho",co:"Portugal",r:{qdl25:{p:9,t:80,tp:8,rd:[80]}},up:[]},
  {n:"Sabrina Ribeiro Crisóstomo",co:"Portugal",r:{qdl25:{p:10,t:88,tp:16,rd:[88]}},up:[]},
  {n:"George Campbell",co:"Ireland",r:{qdl25:{p:12,t:99,tp:27,rd:[99]},gg26:{p:8,t:94,tp:22,rd:[94]}},up:["wjgc26"]},
  {n:"Ricardo Castro Ferreira",co:"Portugal",r:{gg26:{p:1,t:77,tp:5,rd:[77]}},up:[]},
  {n:"Guo Ziyang",co:"China",r:{gg26:{p:3,t:85,tp:13,rd:[85]}},up:[]},
  {n:"Marek Pejas",co:"Portugal",r:{gg26:{p:6,t:92,tp:20,rd:[92]}},up:[]},
  {n:"Miguel Santos Pereira",co:"Portugal",r:{gg26:{p:7,t:93,tp:21,rd:[93]}},up:[]},
  {n:"Harry Seabrook",co:"Portugal",r:{gg26:{p:9,t:98,tp:26,rd:[98]}},up:[]},
  {n:"Gabriel Costa",co:"Portugal",r:{gg26:{p:11,t:99,tp:27,rd:[99]}},up:[]},
  {n:"Yeonjin Seo",co:"South Korea",r:{gg26:{p:12,t:107,tp:35,rd:[107]}},up:[]},
  {n:"Luke Arnao",co:"United States",r:{},up:["marco26"]},
  {n:"Zachary Blayney",co:"Great Britain",r:{},up:["marco26"]},
  {n:"Malthe Bryld Nissen",co:"Denmark",r:{},up:["marco26"]},
  {n:"William Clarke",co:"Great Britain",r:{},up:["marco26"]},
  {n:"Umberto Risso",co:"Italy",r:{},up:["marco26"]},
  {n:"Thiago Selva",co:"Paraguay",r:{},up:["marco26"]},
  {n:"Lorenzo Maria Triolo",co:"Italy",r:{},up:["marco26"]},
  {n:"Alessandro Zhang",co:"Great Britain",r:{},up:["marco26"]},
];

const manuel = D.find(x => x.isM);

// Build column definitions: for each tournament, R1..Rn + Total
const COLS = [];
for (let ti = 0; ti < T.length; ti++) {
  const t = T[ti];
  for (let i = 0; i < t.rounds; i++) {
    COLS.push({ tid: t.id, type: "round", ri: i, label: "R" + (i + 1), tIdx: ti, isFirst: i === 0 });
  }
  COLS.push({ tid: t.id, type: "total", ri: -1, label: "Tot", tIdx: ti, isFirst: false, isTot: true });
  COLS.push({ tid: t.id, type: "pos", ri: -1, label: "Pos", tIdx: ti, isFirst: false });
}

// Compute field averages per round and per total
const AVG_R = {};
const AVG_T = {};
for (const t of T) {
  AVG_R[t.id] = [];
  for (let i = 0; i < t.rounds; i++) {
    const vals = D.filter(p => p.r[t.id] && p.r[t.id].rd && p.r[t.id].rd[i] != null).map(p => p.r[t.id].rd[i]);
    if (vals.length > 1) {
      const m = vals.reduce((a, b) => a + b, 0) / vals.length;
      const s = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
      AVG_R[t.id][i] = { m, s };
    }
  }
  const vals = D.filter(p => p.r[t.id] && p.r[t.id].t != null).map(p => p.r[t.id].t);
  if (vals.length > 1) {
    const m = vals.reduce((a, b) => a + b, 0) / vals.length;
    const s = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length);
    AVG_T[t.id] = { m, s };
  }
}

function zTier(score, stats) {
  if (score == null || !stats || stats.s === 0) return null;
  const z = (score - stats.m) / (stats.s || 1);
  if (z <= -1.2) return "elite";
  if (z <= -0.4) return "strong";
  if (z <= 0.4) return "solid";
  if (z <= 1.2) return "developing";
  return "beginner";
}

const TIER = {
  elite: { bg: "var(--bg-success-strong)", c: "var(--color-good-dark)" },
  strong: { bg: "var(--bg-current)", c: "var(--text-current)" },
  solid: { bg: "var(--bg-warn-light)", c: "var(--color-warn-dark)" },
  developing: { bg: "var(--bg-warn-strong)", c: "var(--color-warn-dark)" },
  beginner: { bg: "var(--bg-danger-subtle)", c: "var(--color-danger-dark)" },
};
const TIER_L = { elite: "Elite", strong: "Forte", solid: "Sólido", developing: "Em Desenv.", beginner: "Iniciante" };

function getTrend(p) {
  const order = ["brjgt25", "eowagr25", "venice25", "rome25", "doral25", "qdl25", "gg26"];
  const s = [];
  for (const tid of order) {
    const res = p.r[tid];
    if (res && res.tp != null) {
      const t = T.find(x => x.id === tid);
      if (t) s.push(res.tp / t.rounds);
    }
  }
  if (s.length < 2) return null;
  const d = s[s.length - 1] - s[0];
  if (d <= -3) return "up2";
  if (d < -0.5) return "up";
  if (d > 3) return "down2";
  if (d > 0.5) return "down";
  return "stable";
}

const TR_I = { up2: { i: "▲▲", c: SC.good }, up: { i: "▲", c: "var(--score-par-seg)" }, stable: { i: "●", c: "var(--text-muted)" }, down: { i: "▼", c: SC.warn }, down2: { i: "▼▼", c: SC.danger } };

// Average z-score across all rounds played
function getAvgZ(p) {
  const zs = [];
  for (const t of T) {
    const res = p.r[t.id];
    if (!res || !res.rd) continue;
    for (let i = 0; i < t.rounds; i++) {
      const sc = res.rd[i];
      const stats = AVG_R[t.id] && AVG_R[t.id][i];
      if (sc != null && stats && stats.s > 0) {
        zs.push((sc - stats.m) / stats.s);
      }
    }
  }
  return zs.length > 0 ? zs.reduce((a, b) => a + b, 0) / zs.length : null;
}

// Get z-score for a specific round
function getRoundZ(p, tid, ri) {
  const res = p.r[tid];
  if (!res || !res.rd || res.rd[ri] == null) return null;
  const stats = AVG_R[tid] && AVG_R[tid][ri];
  if (!stats || stats.s === 0) return null;
  return (res.rd[ri] - stats.m) / stats.s;
}

const allCountries = [...new Set(D.map(p => p.co))].sort();

// Group columns by tournament for header
const tourGroups = T.map(t => ({ id: t.id, short: t.short, date: t.date, span: t.rounds + 2, url: t.url }));

export default function RivaisDashboard() {
  const [fTour, setFTour] = useState("all");
  const [fUp, setFUp] = useState("all");
  const [fCo, setFCo] = useState("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("name");
  const [dir, setDir] = useState("asc");
  const [dOnly, setDOnly] = useState(false);
  const [vsOn, setVsOn] = useState(true);

  const list = useMemo(() => {
    let pl = [...D];
    if (dOnly) pl = pl.filter(x => Object.values(x.r).some(r => r.tp != null));
    if (fTour !== "all") pl = pl.filter(x => x.r[fTour]);
    if (fUp !== "all") pl = pl.filter(x => x.up.includes(fUp));
    if (fCo !== "all") pl = pl.filter(x => x.co === fCo);
    if (q) { const ql = q.toLowerCase(); pl = pl.filter(x => x.n.toLowerCase().includes(ql)); }
    pl.sort((a, b) => {
      if (sort === "name") return dir === "asc" ? a.n.localeCompare(b.n) : b.n.localeCompare(a.n);
      if (sort === "vsManuel") {
        const avg = (x) => {
          const ds = [];
          Object.keys(x.r).forEach(tid => {
            const m = manuel.r[tid];
            if (m && x.r[tid].tp != null && m.tp != null) ds.push(x.r[tid].tp - m.tp);
          });
          return ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : 9999;
        };
        return dir === "asc" ? avg(a) - avg(b) : avg(b) - avg(a);
      }
      if (sort.startsWith("t:")) {
        const tid = sort.slice(2);
        const posOf = (x) => { const r = x.r[tid]; if (!r || r.tp == null) return 9999; return typeof r.p === "number" ? r.p : 9998; };
        return dir === "asc" ? posOf(a) - posOf(b) : posOf(b) - posOf(a);
      }
      if (sort.startsWith("up:")) {
        const uid = sort.slice(3);
        const v = (x) => x.up.includes(uid) ? 0 : 1;
        const d = v(a) - v(b);
        if (d !== 0) return dir === "asc" ? d : -d;
        return a.n.localeCompare(b.n);
      }
      if (sort === "zrank") {
        const za = getAvgZ(a) ?? 9999;
        const zb = getAvgZ(b) ?? 9999;
        return dir === "asc" ? za - zb : zb - za;
      }
      return 0;
    });
    return pl;
  }, [fTour, fUp, fCo, q, sort, dir, dOnly]);

  const doSort = (c) => { if (sort === c) setDir(d => d === "asc" ? "desc" : "asc"); else { setSort(c); setDir("asc"); } };

  function renderCell(player, col) {
    const res = player.r[col.tid];
    const isM = player.isM;
    // Player didn't play this tournament at all
    if (!res || (res.tp == null && res.p !== "WD")) {
      return { val: "", bg: "transparent", color: "transparent", empty: true };
    }

    if (col.type === "round") {
      const score = res.rd && res.rd[col.ri] != null ? res.rd[col.ri] : null;
      if (score == null) return { val: "", bg: "transparent", color: "transparent", empty: true };
      const stats = AVG_R[col.tid] && AVG_R[col.tid][col.ri];
      const ti = zTier(score, stats);
      const st = ti ? TIER[ti] : {};
      const z = stats && stats.s > 0 ? (score - stats.m) / stats.s : null;
      let vsM = null;
      if (!isM && manuel.r[col.tid] && manuel.r[col.tid].rd && manuel.r[col.tid].rd[col.ri] != null) {
        vsM = score - manuel.r[col.tid].rd[col.ri];
      }
      return {
        val: score,
        bg: st.bg || "transparent",
        color: st.c || "var(--text-3)",
        vsM, z,
      };
    }

    if (col.type === "total") {
      if (res.p === "WD") return { val: "WD", bg: "transparent", color: "var(--text-muted)", sub: null };
      if (res.tp == null) return { val: "", bg: "transparent", color: "transparent", empty: true };
      const tObj = T.find(x => x.id === col.tid);
      const playerAvg = res.t / tObj.rounds;
      const roundAvgs = AVG_R[col.tid];
      let fieldAvg = null, fieldStd = null;
      if (roundAvgs && roundAvgs.length > 0) {
        const ms = roundAvgs.filter(x => x).map(x => x.m);
        const ss = roundAvgs.filter(x => x).map(x => x.s);
        if (ms.length > 0) {
          fieldAvg = ms.reduce((a, b) => a + b, 0) / ms.length;
          fieldStd = ss.reduce((a, b) => a + b, 0) / ss.length;
        }
      }
      const ti = fieldAvg != null ? zTier(playerAvg, { m: fieldAvg, s: fieldStd }) : null;
      const st = ti ? TIER[ti] : {};
      const totalStats = AVG_T[col.tid];
      const z = totalStats && totalStats.s > 0 ? (res.t - totalStats.m) / totalStats.s : null;
      let vsM = null;
      if (!isM && manuel.r[col.tid] && manuel.r[col.tid].tp != null) {
        vsM = res.tp - manuel.r[col.tid].tp;
      }
      return {
        val: (res.tp > 0 ? "+" : "") + res.tp,
        bg: st.bg || "transparent",
        color: st.c || "var(--text-3)",
        vsM, z,
      };
    }
    if (col.type === "pos") {
      if (res.p === "WD") return { val: "WD", bg: "transparent", color: "var(--text-muted)", isPos: true };
      if (res.tp == null) return { val: "", bg: "transparent", color: "transparent", empty: true };
      return { val: res.p, bg: "transparent", color: "var(--text)", isPos: true };
    }
    return { val: "", bg: "transparent", color: "transparent", empty: true };
  }

  function getVsAvg(p) {
    if (p.isM) return null;
    const ds = [];
    Object.keys(p.r).forEach(tid => {
      const m = manuel.r[tid];
      if (m && p.r[tid].tp != null && m.tp != null) ds.push(p.r[tid].tp - m.tp);
    });
    return ds.length ? Math.round(ds.reduce((a, b) => a + b, 0) / ds.length) : null;
  }

  return (
    <div className="rivais-page">
      {/* Manuel card */}
      <div className="highlight-card highlight-card-accent">
        <div className="rivais-header-info">
          <div>
            <div className="rivais-header-name">🇵🇹 Manuel Francisco Sousa G. Medeiros</div>
            <div className="rivais-header-pills">
              <span className="pill-sm pill-info">2014</span>
              <span className="pill-sm pill-warn">Sub-12</span>
              <span className="pill-sm pill-info">HCP 12.6</span>
            </div>
          </div>
          <div className="rivais-header-results">
            {T.map(t => {
              const res = manuel.r[t.id];
              if (!res) return null;
              return (
                <div key={t.id} className="rivais-result-card">
                  <div className="rivais-result-label">{t.short}</div>
                  <div className="rivais-result-val">{res.tp > 0 ? "+" : ""}{res.tp}</div>
                  <div className="rivais-result-meta">#{res.p} · {res.rd.join("-")}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input type="text" placeholder="Pesquisar..." value={q} onChange={e => setQ(e.target.value)} className="filter-input" />
        <select value={fTour} onChange={e => setFTour(e.target.value)} className="filter-select">
          <option value="all">Todos Torneios</option>
          {T.map(t => <option key={t.id} value={t.id}>{t.short}</option>)}
        </select>
        <select value={fUp} onChange={e => setFUp(e.target.value)} className="filter-select">
          <option value="all">Próximos: Todos</option>
          {UP.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select value={fCo} onChange={e => setFCo(e.target.value)} className="filter-select">
          <option value="all">🌍 País</option>
          {allCountries.map(c => <option key={c} value={c}>{FL[c] || ""} {c}</option>)}
        </select>
        <label className="filter-checkbox">
          <input type="checkbox" checked={vsOn} onChange={e => setVsOn(e.target.checked)} /> vs Manuel
        </label>
        <label className="filter-checkbox">
          <input type="checkbox" checked={dOnly} onChange={e => setDOnly(e.target.checked)} /> Só com dados
        </label>
        <div className="filter-count">{list.length} jogadores</div>
      </div>

      {/* Legend */}
      <div className="legend-row">
        <span className="fw-700">Nível (vs média campo):</span>
        {Object.keys(TIER).map(k => (
          <span key={k} className="legend-item">
            <span className="legend-dot" style={{ background: TIER[k].bg }} />
            <span style={{ color: TIER[k].c }}>{TIER_L[k]}</span>
          </span>
        ))}
 <span className="c-border" >|</span>
        <span className="pill-xs pill-info">Manuel (referência)</span>
      </div>

      {/* Table */}
      <div className="section-card">
        <div className="scroll-x">
          <table className="rivais-table">
              <thead>
                {/* Tournament group header */}
                <tr className="rivais-group-header">
                  <th rowSpan={2} className="rivais-th-name pointer" onClick={() => doSort("name")}>
                    Jogador {sort === "name" ? (dir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  {tourGroups.map((g, gi) => (
 <th key={g.id} colSpan={g.span} className="ta-center pointer fw-700 fs-10" style={{ padding: "6px 4px", borderLeft: "4px solid #1a1a1a", background: gi % 2 === 1 ? "rgba(255,255,255,0.08)" : "transparent" }} onClick={() => doSort("t:"+g.id)}>
 {g.url ? <a href={g.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2 }} onClick={e => e.stopPropagation()}>{g.short}</a> : g.short} <span className="op-6 fs-9 fw-400 c-inv">({g.date})</span>
                      {sort === "t:"+g.id && <span className="ml-3 fs-9">{dir === "asc" ? "↑" : "↓"}</span>}
                    </th>
                  ))}
                  <th rowSpan={2} className="rivais-th-wide rivais-border-mark">Trend</th>
                  <th rowSpan={2} className="rivais-th-avg pointer" onClick={() => doSort("zrank")} title="Ranking por z-score médio (desvios-padrão da média do campo)">
                    Rank {sort === "zrank" ? (dir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th colSpan={2} className="rivais-th rivais-border-mark">Próximos</th>
                  {vsOn && <th rowSpan={2} className="rivais-th-wide pointer" onClick={() => doSort("vsManuel")}>
                    vs M {sort === "vsManuel" ? (dir === "asc" ? "↑" : "↓") : ""}
                  </th>}
                </tr>
                {/* Round sub-headers */}
                <tr className="rivais-sub-header">
                  {COLS.map((col, i) => (
                    <th key={i} style={{
                      padding: "3px 2px", textAlign: "center", fontSize: 10,
                      fontWeight: col.type === "total" || col.type === "pos" ? 700 : 500,
                      borderLeft: col.isFirst ? "4px solid #1a1a1a" : col.isTot ? "2px solid rgba(255,255,255,0.25)" : "none",
                      minWidth: col.type === "total" ? 38 : col.type === "pos" ? 28 : 30,
                      background: col.tIdx % 2 === 1 ? "rgba(255,255,255,0.06)" : "transparent",
                    }}>
                      {col.label}
                    </th>
                  ))}
                  {UP.map(u => (
 <th key={u.id} className="ta-center pointer fw-700" style={{ padding: "3px 2px", fontSize: u.id === "marco26" ? 7 : 8, borderLeft: u.id === "wjgc26" ? "4px solid #1a1a1a" : "none", minWidth: u.id === "marco26" ? 48 : 38 }} onClick={() => doSort("up:"+u.id)}>
                      {u.url ? <a href={u.url} target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.85)", textDecoration: "underline", textDecorationStyle: "dotted" }} onClick={e => e.stopPropagation()}>{u.short}</a> : u.short}
                      {sort === "up:"+u.id ? (dir === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                  ))}
                </tr>
                {/* Field averages row */}
                <tr className="rivais-avg-row">
                  <th className="rivais-td-name">
                    Média campo
                  </th>
                  {COLS.map((col, i) => {
                    let avg = null;
                    if (col.type === "round") {
                      const ra = AVG_R[col.tid] && AVG_R[col.tid][col.ri];
                      if (ra) avg = ra.m;
                    } else if (col.type === "total") {
                      const ta = AVG_T[col.tid];
                      if (ta) avg = ta.m;
                    }
                    return (
                      <th key={i} style={{
                        padding: "3px 2px", textAlign: "center", fontSize: 10, fontWeight: 600,
                        color: "var(--text-3)",
                        borderLeft: col.isFirst ? "4px solid #1a1a1a" : col.isTot ? "2px solid var(--border-heavy)" : "none",
                        background: col.type === "total" ? "var(--bg-hover)" : (col.tIdx % 2 === 1 ? "var(--bg-hover)" : "var(--bg)"),
                      }}>
                        {avg != null ? avg.toFixed(0) : ""}
                      </th>
                    );
                  })}
                  <th className="bg-page rivais-border-mark"></th>
                  <th className="bg-page bl-heavy"></th>
                  <th className="bg-page rivais-border-mark"></th>
                  <th className="bg-page"></th>
                  {vsOn && <th className="bg-page"></th>}
                </tr>
                {/* SD row */}
                <tr className="bg-hover" style={{ borderBottom: "2px solid var(--text-muted)" }}>
                  <th className="rivais-td-avg">
                    σ (desvio)
                  </th>
                  {COLS.map((col, i) => {
                    let sd = null;
                    if (col.type === "round") {
                      const ra = AVG_R[col.tid] && AVG_R[col.tid][col.ri];
                      if (ra) sd = ra.s;
                    } else if (col.type === "total") {
                      const ta = AVG_T[col.tid];
                      if (ta) sd = ta.s;
                    }
                    return (
                      <th key={i} style={{
                        padding: "2px 2px", textAlign: "center", fontSize: 10, fontWeight: 500,
                        color: "var(--text-muted)", fontStyle: "italic",
                        borderLeft: col.isFirst ? "4px solid #1a1a1a" : col.isTot ? "2px solid var(--border-heavy)" : "none",
                        background: col.type === "total" ? "var(--bg-hover)" : (col.tIdx % 2 === 1 ? "var(--bg-hover)" : "var(--bg-muted)"),
                      }}>
                        {sd != null ? "±" + sd.toFixed(1) : ""}
                      </th>
                    );
                  })}
                  <th className="bg-hover rivais-border-mark"></th>
                  <th className="bg-hover bl-heavy"></th>
                  <th className="bg-hover rivais-border-mark"></th>
                  <th className="bg-hover"></th>
                  {vsOn && <th className="bg-hover"></th>}
                </tr>
              </thead>
              <tbody>
                {list.map(p => {
                  const isM = p.isM;
                  const tr = getTrend(p);
                  const flag = FL[p.co] || "🏳️";
                  const vsAvg = vsOn ? getVsAvg(p) : null;
                  const zAvg = getAvgZ(p);

                  return (
                    <tr key={p.n} style={{
                      borderBottom: isM ? "2px solid #60a5fa" : "1px solid var(--border-light)",
                      background: "var(--bg-card)",
                    }}>
                      <td className="rivais-player-name bg-card">
                        <span className="rivais-flag" title={p.co}>{flag}</span>
 <span className="fs-11 c-text" style={{ fontWeight: isM ? 700 : 600 }}>{p.n}</span>
                        {isM && <span className="pill-xs pill-info ml-4">REF</span>}
                      </td>
                      {COLS.map((col, i) => {
                        const cell = renderCell(p, col);
                        if (cell.empty) {
                          return <td key={i} style={{ background: "var(--bg-card)", borderLeft: col.isFirst ? "4px solid #1a1a1a" : "none" }}></td>;
                        }
                        const isTotal = col.type === "total";
                        const isPos = col.type === "pos";
                        const isOdd = col.tIdx % 2 === 1;
                        const groupTint = isOdd ? "var(--bg-muted)" : "transparent";
                        let bg = cell.bg;
                        if (isTotal) {
                          bg = cell.bg !== "transparent" ? cell.bg : (isOdd ? "var(--border-light)" : "var(--bg-hover)");
                        } else if (isPos) {
                          bg = isOdd ? "var(--bg-detail)" : "var(--bg)";
                        } else if (bg === "transparent") {
                          bg = groupTint;
                        }
                        if (isPos) {
                          return (
                            <td key={i} style={{
                              padding: "5px 2px", textAlign: "center", fontSize: 10,
                              fontWeight: 700, color: cell.color, background: bg,
                            }}>
                              {cell.val}
                            </td>
                          );
                        }
                        return (
                          <td key={i} style={{
                            padding: isTotal ? "5px 6px" : "5px 3px",
                            textAlign: "center", fontSize: 11,
                            fontWeight: isTotal ? 700 : 600,
                            borderLeft: col.isFirst ? "4px solid #1a1a1a" : col.isTot ? "2px solid var(--border-heavy)" : "none",
                            background: bg,
                            color: cell.color,
                          }}>
                            {cell.val}
 {cell.z != null && <div className="fw-600 fs-10 mt-1" style={{ color: sc3m(cell.z, 0.4, 0.4), opacity: 0.75 }}>{cell.z > 0 ? "+" : ""}{cell.z.toFixed(1)}σ</div>}
 {vsOn && cell.vsM != null && <div className="fw-600 fs-10 mt-1" style={{ color: sc3m(cell.vsM, 0, 0) }}>{cell.vsM > 0 ? "+" : ""}{cell.vsM}</div>}
                          </td>
                        );
                      })}
                      <td className="rivais-td rivais-border-mark">
 {tr ? <span className="fw-700 fs-12" style={{ color: TR_I[tr].c }}>{TR_I[tr].i}</span> : <span style={{ color: "var(--border)" }}>—</span>}
                      </td>
                      <td className="rivais-td-sep">
                        {zAvg != null ? (
 <span className="fs-10 fw-700" style={{ color: sc3m(zAvg, 0.4, 0.4) }}>
                            {zAvg > 0 ? "+" : ""}{zAvg.toFixed(2)}
                          </span>
 ) : <span className="fs-9 c-border" >—</span>}
                      </td>
                      <td className="rivais-td rivais-border-mark">
 {p.up.includes("wjgc26") ? <span >✓</span> : <span className="fs-9 fs-10 fw-700 c-good-dark-inline" style={{ color: "var(--border)" }}>—</span>}
                      </td>
                      <td className="rivais-td">
 {p.up.includes("marco26") ? <span style={{ color: "var(--badge-club-text)" }}>✓</span> : <span className="fs-9 fs-10 fw-700" style={{ color: "var(--border)" }}>—</span>}
                      </td>
                      {vsOn && (
                        <td className="rivais-td">
 {isM ? <span className="fs-9 c-border" >—</span> :
 vsAvg != null ? <span className="fs-11 fw-700" style={{ color: sc3m(vsAvg, 0, 0) }}>{vsAvg > 0 ? "+" : ""}{vsAvg}</span> :
 <span className="fs-9 c-border" >—</span>}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="section-subtitle ta-c mt-10" style={{ padding: "8px 0" }}>
          Nível calculado por desvio padrão (σ) em relação à média do campo · Rank = z-score médio (negativo = melhor que a média) · Clica nos cabeçalhos para ordenar
        </div>
    </div>
  );
}
