// The research behind the app, shown on the Research page and on each theme page.
// Kept in step with docs/research.md, which has the full write-up, strength ratings and
// caveats. Every source was checked against Crossref, PubMed or library records.
import type { CategoryId } from './questions/types';

export interface Source {
  /** APA reference. */
  cite: string;
  /** DOI link, or a library record for books. */
  url: string;
}

/** How much weight the evidence can bear: Strong, Moderate or Emerging (see docs/research.md). */
export interface ResearchNote {
  strength: string;
  summary: string;
  sources: Source[];
}

export interface Principle {
  title: string;
  strength: string;
  /** What the research found. */
  body: string;
  /** What the app does with it. */
  inApp: string;
  sources: Source[];
}

export interface Caveat {
  title: string;
  body: string;
  sources: Source[];
}

const R = {
  aleaBluck2007: {
    cite: 'Alea, N., & Bluck, S. (2007). I\'ll keep you in mind: The intimacy function of autobiographical memory. Applied Cognitive Psychology, 21(8), 1091–1111.',
    url: 'https://doi.org/10.1002/acp.1316',
  },
  algoe2012: {
    cite: 'Algoe, S. B. (2012). Find, remind, and bind: The functions of gratitude in everyday relationships. Social and Personality Psychology Compass, 6(6), 455–469.',
    url: 'https://doi.org/10.1111/j.1751-9004.2012.00439.x',
  },
  amatoBooth2001: {
    cite: 'Amato, P. R., & Booth, A. (2001). The legacy of parents\' marital discord: Consequences for children\'s marital quality. Journal of Personality and Social Psychology, 81(4), 627–638.',
    url: 'https://doi.org/10.1037/0022-3514.81.4.627',
  },
  amatoDeBoer2001: {
    cite: 'Amato, P. R., & DeBoer, D. D. (2001). The transmission of marital instability across generations: Relationship skills or commitment to marriage? Journal of Marriage and Family, 63(4), 1038–1051.',
    url: 'https://doi.org/10.1111/j.1741-3737.2001.01038.x',
  },
  aronAron1986: {
    cite: 'Aron, A., & Aron, E. N. (1986). Love and the expansion of self: Understanding attraction and satisfaction. Hemisphere.',
    url: 'https://openlibrary.org/books/OL2533265M',
  },
  aronEtAl1997: {
    cite: 'Aron, A., Melinat, E., Aron, E. N., Vallone, R. D., & Bator, R. J. (1997). The experimental generation of interpersonal closeness: A procedure and some preliminary findings. Personality and Social Psychology Bulletin, 23(4), 363–377.',
    url: 'https://doi.org/10.1177/0146167297234003',
  },
  aronEtAl2000: {
    cite: 'Aron, A., Norman, C. C., Aron, E. N., McKenna, C., & Heyman, R. E. (2000). Couples\' shared participation in novel and arousing activities and experienced relationship quality. Journal of Personality and Social Psychology, 78(2), 273–284.',
    url: 'https://doi.org/10.1037/0022-3514.78.2.273',
  },
  bodenmann2005: {
    cite: 'Bodenmann, G. (2005). Dyadic coping and its significance for marital functioning. In T. A. Revenson, K. Kayser, & G. Bodenmann (Eds.), Couples coping with stress: Emerging perspectives on dyadic coping (pp. 33–49). American Psychological Association.',
    url: 'https://doi.org/10.1037/11031-002',
  },
  brunsteinEtAl1996: {
    cite: 'Brunstein, J. C., Dangelmayer, G., & Schultheiss, O. C. (1996). Personal goals and social support in close relationships: Effects on relationship mood and marital satisfaction. Journal of Personality and Social Psychology, 71(5), 1006–1019.',
    url: 'https://doi.org/10.1037/0022-3514.71.5.1006',
  },
  buehlmanEtAl1992: {
    cite: 'Buehlman, K. T., Gottman, J. M., & Katz, L. F. (1992). How a couple views their past predicts their future: Predicting divorce from an oral history interview. Journal of Family Psychology, 5(3–4), 295–318.',
    url: 'https://doi.org/10.1037/0893-3200.5.3-4.295',
  },
  buntHazelwood2017: {
    cite: 'Bunt, S., & Hazelwood, Z. J. (2017). Walking the walk, talking the talk: Love languages, self-regulation, and relationship satisfaction. Personal Relationships, 24(2), 280–290.',
    url: 'https://doi.org/10.1111/pere.12182',
  },
  carlsonEtAl2016: {
    cite: 'Carlson, D. L., Miller, A. J., Sassler, S., & Hanson, S. (2016). The gendered division of housework and couples\' sexual relationships: A reexamination. Journal of Marriage and Family, 78(4), 975–995.',
    url: 'https://doi.org/10.1111/jomf.12313',
  },
  chapman1992: {
    cite: 'Chapman, G. D. (1992). The five love languages. Northfield.',
    url: 'https://openlibrary.org/books/OL1503025M',
  },
  cordovaEtAl2014: {
    cite: 'Cordova, J. V., Fleming, C. J. E., Morrill, M. I., Hawrilenko, M., Sollenberger, J. W., Harp, A. G., Gray, T. D., Darling, E. V., Blair, J. M., Meade, A. E., & Wachs, K. (2014). The Marriage Checkup: A randomized controlled trial of annual relationship health checkups. Journal of Consulting and Clinical Psychology, 82(4), 592–604.',
    url: 'https://doi.org/10.1037/a0037097',
  },
  dewEtAl2012: {
    cite: 'Dew, J., Britt, S., & Huston, S. (2012). Examining the relationship between financial issues and divorce. Family Relations, 61(4), 615–628.',
    url: 'https://doi.org/10.1111/j.1741-3729.2012.00715.x',
  },
  dossEtAl2009: {
    cite: 'Doss, B. D., Rhoades, G. K., Stanley, S. M., & Markman, H. J. (2009). The effect of the transition to parenthood on relationship quality: An 8-year prospective study. Journal of Personality and Social Psychology, 96(3), 601–619.',
    url: 'https://doi.org/10.1037/a0013969',
  },
  dossEtAl2016: {
    cite: 'Doss, B. D., Cicila, L. N., Georgia, E. J., Roddy, M. K., Nowlan, K. M., Benson, L. A., & Christensen, A. (2016). A randomized controlled trial of the web-based OurRelationship program: Effects on relationship and individual functioning. Journal of Consulting and Clinical Psychology, 84(4), 285–296.',
    url: 'https://doi.org/10.1037/ccp0000063',
  },
  drigotasEtAl1999: {
    cite: 'Drigotas, S. M., Rusbult, C. E., Wieselquist, J., & Whitton, S. W. (1999). Close partner as sculptor of the ideal self: Behavioral affirmation and the Michelangelo phenomenon. Journal of Personality and Social Psychology, 77(2), 293–323.',
    url: 'https://doi.org/10.1037/0022-3514.77.2.293',
  },
  driverGottman2004: {
    cite: 'Driver, J. L., & Gottman, J. M. (2004). Daily marital interactions and positive affect during marital conflict among newlywed couples. Family Process, 43(3), 301–314.',
    url: 'https://doi.org/10.1111/j.1545-5300.2004.00024.x',
  },
  falconierEtAl2015: {
    cite: 'Falconier, M. K., Jackson, J. B., Hilpert, P., & Bodenmann, G. (2015). Dyadic coping and relationship satisfaction: A meta-analysis. Clinical Psychology Review, 42, 28–46.',
    url: 'https://doi.org/10.1016/j.cpr.2015.07.002',
  },
  fawcettEtAl2010: {
    cite: 'Fawcett, E. B., Hawkins, A. J., Blanchard, V. L., & Carroll, J. S. (2010). Do premarital education programs really work? A meta-analytic study. Family Relations, 59(3), 232–239.',
    url: 'https://doi.org/10.1111/j.1741-3729.2010.00598.x',
  },
  feeney2004: {
    cite: 'Feeney, B. C. (2004). A secure base: Responsive support of goal strivings and exploration in adult intimate relationships. Journal of Personality and Social Psychology, 87(5), 631–648.',
    url: 'https://doi.org/10.1037/0022-3514.87.5.631',
  },
  fieseEtAl2002: {
    cite: 'Fiese, B. H., Tomcho, T. J., Douglas, M., Josephs, K., Poltrock, S., & Baker, T. (2002). A review of 50 years of research on naturally occurring family routines and rituals: Cause for celebration? Journal of Family Psychology, 16(4), 381–390.',
    url: 'https://doi.org/10.1037/0893-3200.16.4.381',
  },
  finkelEtAl2013: {
    cite: 'Finkel, E. J., Slotter, E. B., Luchies, L. B., Walton, G. M., & Gross, J. J. (2013). A brief intervention to promote conflict reappraisal preserves marital quality over time. Psychological Science, 24(8), 1595–1601.',
    url: 'https://doi.org/10.1177/0956797612474938',
  },
  frattaroli2006: {
    cite: 'Frattaroli, J. (2006). Experimental disclosure and its moderators: A meta-analysis. Psychological Bulletin, 132(6), 823–865.',
    url: 'https://doi.org/10.1037/0033-2909.132.6.823',
  },
  gableEtAl2004: {
    cite: 'Gable, S. L., Reis, H. T., Impett, E. A., & Asher, E. R. (2004). What do you do when things go right? The intrapersonal and interpersonal benefits of sharing positive events. Journal of Personality and Social Psychology, 87(2), 228–245.',
    url: 'https://doi.org/10.1037/0022-3514.87.2.228',
  },
  gableEtAl2006: {
    cite: 'Gable, S. L., Gonzaga, G. C., & Strachman, A. (2006). Will you be there for me when things go right? Supportive responses to positive event disclosures. Journal of Personality and Social Psychology, 91(5), 904–917.',
    url: 'https://doi.org/10.1037/0022-3514.91.5.904',
  },
  goldberg1992: {
    cite: 'Goldberg, L. R. (1992). The development of markers for the Big-Five factor structure. Psychological Assessment, 4(1), 26–42.',
    url: 'https://doi.org/10.1037/1040-3590.4.1.26',
  },
  goldbergEtAl2006: {
    cite: 'Goldberg, L. R., Johnson, J. A., Eber, H. W., Hogan, R., Ashton, M. C., Cloninger, C. R., & Gough, H. G. (2006). The international personality item pool and the future of public-domain personality measures. Journal of Research in Personality, 40(1), 84–96.',
    url: 'https://doi.org/10.1016/j.jrp.2005.08.007',
  },
  gordonEtAl2012: {
    cite: 'Gordon, A. M., Impett, E. A., Kogan, A., Oveis, C., & Keltner, D. (2012). To have and to hold: Gratitude promotes relationship maintenance in intimate bonds. Journal of Personality and Social Psychology, 103(2), 257–274.',
    url: 'https://doi.org/10.1037/a0028723',
  },
  gottmanDeClaire2001: {
    cite: 'Gottman, J. M., & DeClaire, J. (2001). The relationship cure: A five-step guide for building better connections with family, friends, and lovers. Crown.',
    url: 'https://openlibrary.org/books/OL7585797M',
  },
  gottmanDriver2005: {
    cite: 'Gottman, J. M., & Driver, J. L. (2005). Dysfunctional marital conflict and everyday marital interaction. Journal of Divorce & Remarriage, 43(3–4), 63–77.',
    url: 'https://doi.org/10.1300/J087v43n03_04',
  },
  gottmanLevenson1992: {
    cite: 'Gottman, J. M., & Levenson, R. W. (1992). Marital processes predictive of later dissolution: Behavior, physiology, and health. Journal of Personality and Social Psychology, 63(2), 221–233.',
    url: 'https://doi.org/10.1037/0022-3514.63.2.221',
  },
  gottmanLevenson2000: {
    cite: 'Gottman, J. M., & Levenson, R. W. (2000). The timing of divorce: Predicting when a couple will divorce over a 14-year period. Journal of Marriage and Family, 62(3), 737–745.',
    url: 'https://doi.org/10.1111/j.1741-3737.2000.00737.x',
  },
  gottmanSilver1999: {
    cite: 'Gottman, J. M., & Silver, N. (1999). The seven principles for making marriage work. Crown.',
    url: 'https://openlibrary.org/books/OL382981M',
  },
  gowEtAl2005: {
    cite: "Gow, A. J., Whiteman, M. C., Pattie, A., & Deary, I. J. (2005). Goldberg's 'IPIP' Big-Five factor markers: Internal consistency and concurrent validation in Scotland. Personality and Individual Differences, 39(2), 317–329.",
    url: 'https://doi.org/10.1016/j.paid.2005.01.011',
  },
  hawkinsEtAl2008: {
    cite: 'Hawkins, A. J., Blanchard, V. L., Baldwin, S. A., & Fawcett, E. B. (2008). Does marriage and relationship education work? A meta-analytic study. Journal of Consulting and Clinical Psychology, 76(5), 723–734.',
    url: 'https://doi.org/10.1037/a0012584',
  },
  hazanShaver1987: {
    cite: 'Hazan, C., & Shaver, P. (1987). Romantic love conceptualized as an attachment process. Journal of Personality and Social Psychology, 52(3), 511–524.',
    url: 'https://doi.org/10.1037/0022-3514.52.3.511',
  },
  heymanSlep2001: {
    cite: 'Heyman, R. E., & Slep, A. M. S. (2001). The hazards of predicting divorce without crossvalidation. Journal of Marriage and Family, 63(2), 473–479.',
    url: 'https://doi.org/10.1111/j.1741-3737.2001.00473.x',
  },
  huangEtAl2017: {
    cite: 'Huang, K., Yeomans, M., Brooks, A. W., Minson, J., & Gino, F. (2017). It doesn\'t hurt to ask: Question-asking increases liking. Journal of Personality and Social Psychology, 113(3), 430–452.',
    url: 'https://doi.org/10.1037/pspi0000097',
  },
  impettEtAl2024: {
    cite: 'Impett, E. A., Park, H. G., & Muise, A. (2024). Popular psychology through a scientific lens: Evaluating love languages from a relationship science perspective. Current Directions in Psychological Science, 33(2), 87–92.',
    url: 'https://doi.org/10.1177/09637214231217663',
  },
  kardasEtAl2022: {
    cite: 'Kardas, M., Kumar, A., & Epley, N. (2022). Overly shallow?: Miscalibrated expectations create a barrier to deeper conversation. Journal of Personality and Social Psychology, 122(3), 367–398.',
    url: 'https://doi.org/10.1037/pspa0000281',
  },
  kuperberg2014: {
    cite: 'Kuperberg, A. (2014). Age at coresidence, premarital cohabitation, and marriage dissolution: 1985–2009. Journal of Marriage and Family, 76(2), 352–369.',
    url: 'https://doi.org/10.1111/jomf.12092',
  },
  lachanceGrzelaBouchard2010: {
    cite: 'Lachance-Grzela, M., & Bouchard, G. (2010). Why do women do the lion\'s share of housework? A decade of research. Sex Roles, 63(11–12), 767–780.',
    url: 'https://doi.org/10.1007/s11199-010-9797-z',
  },
  lallyEtAl2010: {
    cite: 'Lally, P., van Jaarsveld, C. H. M., Potts, H. W. W., & Wardle, J. (2010). How are habits formed: Modelling habit formation in the real world. European Journal of Social Psychology, 40(6), 998–1009.',
    url: 'https://doi.org/10.1002/ejsp.674',
  },
  laurenceauEtAl1998: {
    cite: 'Laurenceau, J.-P., Barrett, L. F., & Pietromonaco, P. R. (1998). Intimacy as an interpersonal process: The importance of self-disclosure, partner disclosure, and perceived partner responsiveness in interpersonal exchanges. Journal of Personality and Social Psychology, 74(5), 1238–1251.',
    url: 'https://doi.org/10.1037/0022-3514.74.5.1238',
  },
  leAgnew2003: {
    cite: 'Le, B., & Agnew, C. R. (2003). Commitment and its theorized determinants: A meta-analysis of the Investment Model. Personal Relationships, 10(1), 37–57.',
    url: 'https://doi.org/10.1111/1475-6811.00035',
  },
  mahoneyEtAl1999: {
    cite: 'Mahoney, A., Pargament, K. I., Jewell, T., Swank, A. B., Scott, E., Emery, E., & Rye, M. (1999). Marriage and the spiritual realm: The role of proximal and distal religious constructs in marital functioning. Journal of Family Psychology, 13(3), 321–338.',
    url: 'https://doi.org/10.1037/0893-3200.13.3.321',
  },
  mallory2022: {
    cite: 'Mallory, A. B. (2022). Dimensions of couples\' sexual communication, relationship satisfaction, and sexual satisfaction: A meta-analysis. Journal of Family Psychology, 36(3), 358–371.',
    url: 'https://doi.org/10.1037/fam0000946',
  },
  malloryEtAl2019: {
    cite: 'Mallory, A. B., Stanton, A. M., & Handy, A. B. (2019). Couples\' sexual communication and dimensions of sexual function: A meta-analysis. The Journal of Sex Research, 56(7), 882–898.',
    url: 'https://doi.org/10.1080/00224499.2019.1568375',
  },
  mitnickEtAl2009: {
    cite: 'Mitnick, D. M., Heyman, R. E., & Smith Slep, A. M. (2009). Changes in relationship satisfaction across the transition to parenthood: A meta-analysis. Journal of Family Psychology, 23(6), 848–852.',
    url: 'https://doi.org/10.1037/a0017004',
  },
  mostovaEtAl2022: {
    cite: 'Mostova, O., Stolarski, M., & Matthews, G. (2022). I love the way you love me: Responding to partner\'s love language preferences boosts satisfaction in romantic heterosexual couples. PLOS ONE, 17(6), e0269429.',
    url: 'https://doi.org/10.1371/journal.pone.0269429',
  },
  muiseEtAl2013: {
    cite: 'Muise, A., Impett, E. A., Kogan, A., & Desmarais, S. (2013). Keeping the spark alive: Being motivated to meet a partner\'s sexual needs sustains sexual desire in long-term romantic relationships. Social Psychological and Personality Science, 4(3), 267–273.',
    url: 'https://doi.org/10.1177/1948550612457185',
  },
  neffKarney2009: {
    cite: 'Neff, L. A., & Karney, B. R. (2009). Stress and reactivity to daily relationship experiences: How stress hinders adaptive processes in marriage. Journal of Personality and Social Psychology, 97(3), 435–450.',
    url: 'https://doi.org/10.1037/a0015663',
  },
  orbuchEtAl2013: {
    cite: 'Orbuch, T. L., Bauermeister, J. A., Brown, E., & McKinley, B.-D. (2013). Early family ties and marital stability over 16 years: The context of race and gender. Family Relations, 62(2), 255–268.',
    url: 'https://doi.org/10.1111/fare.12005',
  },
  owenEtAl2013: {
    cite: 'Owen, J., Rhoades, G. K., & Stanley, S. M. (2013). Sliding versus deciding in relationships: Associations with relationship quality, commitment, and infidelity. Journal of Couple & Relationship Therapy, 12(2), 135–149.',
    url: 'https://doi.org/10.1080/15332691.2013.779097',
  },
  pappEtAl2009: {
    cite: 'Papp, L. M., Cummings, E. M., & Goeke-Morey, M. C. (2009). For richer, for poorer: Money as a topic of marital conflict in the home. Family Relations, 58(1), 91–103.',
    url: 'https://doi.org/10.1111/j.1741-3729.2008.00537.x',
  },
  pennebaker1997: {
    cite: 'Pennebaker, J. W. (1997). Writing about emotional experiences as a therapeutic process. Psychological Science, 8(3), 162–166.',
    url: 'https://doi.org/10.1111/j.1467-9280.1997.tb00403.x',
  },
  primeEtAl2024: {
    cite: 'Prime, H., Muise, A., Jambon, M., Koven, M., Markwell, A., & Wade, M. (2024). A pilot randomized controlled trial of a brief conflict reappraisal intervention for community couples with young children. Cognitive Therapy and Research, 48(5), 895–909.',
    url: 'https://doi.org/10.1007/s10608-024-10485-x',
  },
  rathgeberEtAl2019: {
    cite: 'Rathgeber, M., Bürkner, P.-C., Schiller, E.-M., & Holling, H. (2019). The efficacy of emotionally focused couples therapy and behavioral couples therapy: A meta-analysis. Journal of Marital and Family Therapy, 45(3), 447–463.',
    url: 'https://doi.org/10.1111/jmft.12336',
  },
  reisEtAl2004: {
    cite: 'Reis, H. T., Clark, M. S., & Holmes, J. G. (2004). Perceived partner responsiveness as an organizing construct in the study of intimacy and closeness. In D. J. Mashek & A. P. Aron (Eds.), Handbook of closeness and intimacy (pp. 201–225). Lawrence Erlbaum Associates.',
    url: 'https://doi.org/10.4324/9781410610010',
  },
  reisShaver1988: {
    cite: 'Reis, H. T., & Shaver, P. (1988). Intimacy as an interpersonal process. In S. Duck (Ed.), Handbook of personal relationships (pp. 367–389). Wiley. Reprinted in H. T. Reis (2018), Relationships, well-being and behaviour (pp. 113–143). Routledge.',
    url: 'https://doi.org/10.4324/9780203732496-5',
  },
  rhoadesEtAl2009: {
    cite: 'Rhoades, G. K., Stanley, S. M., & Markman, H. J. (2009). The pre-engagement cohabitation effect: A replication and extension of previous findings. Journal of Family Psychology, 23(1), 107–111.',
    url: 'https://doi.org/10.1037/a0014358',
  },
  rosenfeldRoesler2019: {
    cite: 'Rosenfeld, M. J., & Roesler, K. (2019). Cohabitation experience and cohabitation\'s association with marital dissolution. Journal of Marriage and Family, 81(1), 42–58.',
    url: 'https://doi.org/10.1111/jomf.12530',
  },
  rusbult1980: {
    cite: 'Rusbult, C. E. (1980). Commitment and satisfaction in romantic associations: A test of the investment model. Journal of Experimental Social Psychology, 16(2), 172–186.',
    url: 'https://doi.org/10.1016/0022-1031(80)90007-4',
  },
  shapiroEtAl2000: {
    cite: 'Shapiro, A. F., Gottman, J. M., & Carrère, S. (2000). The baby and the marriage: Identifying factors that buffer against decline in marital satisfaction after the first baby arrives. Journal of Family Psychology, 14(1), 59–70.',
    url: 'https://doi.org/10.1037/0893-3200.14.1.59',
  },
  slatcherPennebaker2006: {
    cite: 'Slatcher, R. B., & Pennebaker, J. W. (2006). How do I love thee? Let me count the words: The social effects of expressive writing. Psychological Science, 17(8), 660–664.',
    url: 'https://doi.org/10.1111/j.1467-9280.2006.01762.x',
  },
  sprecherEtAl2013: {
    cite: 'Sprecher, S., Treger, S., Wondra, J. D., Hilaire, N., & Wallpe, K. (2013). Taking turns: Reciprocal self-disclosure promotes liking in initial interactions. Journal of Experimental Social Psychology, 49(5), 860–866.',
    url: 'https://doi.org/10.1016/j.jesp.2013.03.017',
  },
  stanleyEtAl2000: {
    cite: 'Stanley, S. M., Bradbury, T. N., & Markman, H. J. (2000). Structural flaws in the bridge from basic research on marriage to interventions for couples. Journal of Marriage and Family, 62(1), 256–264.',
    url: 'https://doi.org/10.1111/j.1741-3737.2000.00256.x',
  },
  stanleyEtAl2006: {
    cite: 'Stanley, S. M., Rhoades, G. K., & Markman, H. J. (2006). Sliding versus deciding: Inertia and the premarital cohabitation effect. Family Relations, 55(4), 499–509.',
    url: 'https://doi.org/10.1111/j.1741-3729.2006.00418.x',
  },
  stanleyMarkman1992: {
    cite: 'Stanley, S. M., & Markman, H. J. (1992). Assessing commitment in personal relationships. Journal of Marriage and the Family, 54(3), 595–608.',
    url: 'https://doi.org/10.2307/353245',
  },
  twengeEtAl2003: {
    cite: 'Twenge, J. M., Campbell, W. K., & Foster, C. A. (2003). Parenthood and marital satisfaction: A meta-analytic review. Journal of Marriage and Family, 65(3), 574–583.',
    url: 'https://doi.org/10.1111/j.1741-3737.2003.00574.x',
  },
  wiebeJohnson2016: {
    cite: 'Wiebe, S. A., & Johnson, S. M. (2016). A review of the research in emotionally focused therapy for couples. Family Process, 55(3), 390–407.',
    url: 'https://doi.org/10.1111/famp.12229',
  },
  wieselquistEtAl1999: {
    cite: 'Wieselquist, J., Rusbult, C. E., Foster, C. A., & Agnew, C. R. (1999). Commitment, pro-relationship behavior, and trust in close relationships. Journal of Personality and Social Psychology, 77(5), 942–966.',
    url: 'https://doi.org/10.1037/0022-3514.77.5.942',
  },
  woodsEtAl2015: {
    cite: 'Woods, S., Lambert, N., Brown, P., Fincham, F., & May, R. (2015). "I\'m so excited for you!" How an enthusiastic responding intervention enhances close relationships. Journal of Social and Personal Relationships, 32(1), 24–40.',
    url: 'https://doi.org/10.1177/0265407514523545',
  },
} satisfies Record<string, Source>;

/** Every source cited in docs/research.md, by first author. */
export const REFERENCES: Source[] = Object.values(R);

/** How the app's design follows the research. */
export const PRINCIPLES: Principle[] = [
  {
    title: 'Writing, not tapping',
    strength: 'Moderate for writing in general; Emerging for couples',
    body: 'Across 146 randomized studies, writing about feelings and experiences had a small but real benefit. In one study of dating couples, those where one partner wrote about the relationship for three days were more likely to be together three months later (77% vs. 52%). In a two-year trial, married couples who spent three 7-minute sessions writing about a disagreement from the point of view of a neutral observer who wants the best for both of them didn’t show the decline in marital quality that other couples did.',
    inApp: 'Every answer is free writing. Writing tips nudge you toward feelings and meaning, not just facts, and some conflict questions borrow the neutral-observer exercise.',
    sources: [R.pennebaker1997, R.frattaroli2006, R.slatcherPennebaker2006, R.finkelEtAl2013],
  },
  {
    title: 'Answer first, then read',
    strength: 'Moderate for disclosure and intimacy; the reveal itself is untested',
    body: 'Closeness grows when both partners open up and each feels the other respond. Taking turns disclosing builds more liking than one-sided sharing, and structured, mutual questions built closeness even between strangers. Filmed going about everyday life, newlyweds disclosed little to each other unprompted.',
    inApp: 'Your partner’s answer stays hidden until you’ve written yours, so you both share, and each answer is your own rather than a reaction. This reveal is our design choice, based on that research; no study has tested it.',
    sources: [R.laurenceauEtAl1998, R.sprecherEtAl2013, R.aronEtAl1997, R.gottmanDriver2005],
  },
  {
    title: 'Responding with curiosity',
    strength: 'Moderate',
    body: 'Feeling understood, valued and cared for is at the heart of intimacy. How partners responded to good news predicted relationship well-being and breakups better than how they responded to bad news. Asking follow-up questions makes people seem more responsive and more likable.',
    inApp: 'After the reveal you can write back, with tips that encourage questions and enthusiasm. Training people to respond enthusiastically changed how they saw their partner but not their short-term satisfaction, so treat the tips as prompts, not promises.',
    sources: [R.reisShaver1988, R.gableEtAl2004, R.gableEtAl2006, R.huangEtAl2017, R.woodsEtAl2015],
  },
  {
    title: 'A small daily ritual',
    strength: 'Emerging',
    body: 'Relationships are built from small, everyday moments of turning toward each other, and routines and rituals go with happier marriages, though those studies are correlational. Habits form through repetition in a consistent setting over weeks to months, and missing a day didn’t undo them.',
    inApp: 'One question a day, and an optional reminder once a day at a time you each choose. A quiet “days in a row” appears when you’ve both answered two or more days running; nothing happens when a streak breaks. A snuggle is a one-tap bid your partner can return; whether a tap works like a bid in person is untested.',
    sources: [R.gottmanDeClaire2001, R.driverGottman2004, R.fieseEtAl2002, R.lallyEtAl2010],
  },
  {
    title: 'A few lines about your day',
    strength: 'Moderate for the ingredients; the journal itself is untested',
    body: 'Sharing good news and getting an enthusiastic response goes with more intimacy and daily satisfaction. Supporting each other through stress is strongly linked with satisfaction, and stress from outside the relationship makes everyday ups and downs hit harder. Appreciation helps partners notice each other’s care and draw closer.',
    inApp: 'The journal asks for something good, something hard and something you appreciated about each other, a line or two each, with a longer look back on Sundays. You read each other’s day once you’ve both written. Putting these together as a daily journal is our design, and no study has tested it.',
    sources: [R.gableEtAl2004, R.gableEtAl2006, R.bodenmann2005, R.falconierEtAl2015, R.neffKarney2009, R.algoe2012, R.gordonEtAl2012],
  },
  {
    title: 'Date nights, planned ahead',
    strength: 'Emerging',
    body: 'In lab experiments, couples who did something new and a little challenging together rated their relationship higher afterwards, at least in the short term. Routines and rituals go with happier marriages, though those studies are correlational and used inconsistent methods.',
    inApp: 'A shared list of date ideas, with suggestions that lean toward new things, and a calendar for deciding ahead what you’ll do and who’s planning it. Planning ahead and taking turns are our design choices, and no study has tested them.',
    sources: [R.aronEtAl2000, R.fieseEtAl2002],
  },
  {
    title: 'Remembering your story',
    strength: 'Emerging',
    body: 'How couples told the story of their relationship, with fondness and a sense of “we”, predicted who stayed together in one small study, though the predictions were never tested on new couples. In an experiment, recalling their own relationship memories raised the warmth people felt toward their partner, measured before and after remembering.',
    inApp: 'The timeline keeps your milestones, with each of your own memories of them, and brings one back on its anniversary. Keeping a timeline together is our design, and no study has tested whether it helps.',
    sources: [R.buehlmanEtAl1992, R.aleaBluck2007],
  },
  {
    title: 'Knowing your personality',
    strength: 'Moderate for what the questionnaire measures',
    body: 'The Big Five describe personality along five broad traits. Goldberg’s 50-item questionnaire, from the free International Personality Item Pool, sorts into those traits as intended, and three of its five scales line up closely with a longer, commercial inventory. It has no published norms, so scores show where you put yourself, not how you compare with anyone.',
    inApp: 'Self has the 50-item questionnaire. Your scores are private unless you share your latest with your partner, who then sees the scores but never your answers. It doesn’t sort anyone into types or compare partners, and whether knowing your scores helps is untested.',
    sources: [R.goldberg1992, R.goldbergEtAl2006, R.gowEtAl2005],
  },
  {
    title: 'Questions that deepen gradually',
    strength: 'Moderate, though mostly from studies with strangers',
    body: 'In the well-known “36 questions” study, questions that moved from light to personal built more closeness than small talk. It measured closeness, not love. People expect deep conversations to be more awkward than they turn out to be, and come away more connected than from shallow ones.',
    inApp: 'Daily questions are Openers for your first week, can be Reflective until day 21, and can come from any depth after that. That schedule is our choice, informed by this research, and hasn’t been tested itself.',
    sources: [R.aronEtAl1997, R.kardasEtAl2022],
  },
  {
    title: 'Regular check-ins',
    strength: 'Moderate; one randomized trial of an in-person version',
    body: 'A yearly “Marriage Checkup” with a clinician improved intimacy and acceptance and reduced distress over two years, compared with couples who waited. The effects were small to moderate.',
    inApp: 'After your first week, Sundays bring a check-in question about how the two of you are doing. It borrows the checkup’s rhythm, not its clinician or feedback. Couples who are struggling have better-tested options, such as the online OurRelationship program or a couples therapist.',
    sources: [R.cordovaEtAl2014, R.dossEtAl2016],
  },
  {
    title: 'Deciding, not sliding',
    strength: 'Moderate; large observational studies, some contested',
    body: 'Many couples slide into living together without deciding to, and that inertia can carry them into commitments they didn’t choose deliberately. People who make relationship decisions more deliberately report more dedication and satisfaction. How much moving in early matters is debated, partly because it reflects how young couples were. After a first baby, relationship quality typically dips a little and stays lower.',
    inApp: 'Hypothetical questions about moving in, marriage and children are matched to where you are, so you can talk a transition through before you’re in it.',
    sources: [R.stanleyEtAl2006, R.owenEtAl2013, R.kuperberg2014, R.dossEtAl2009],
  },
];

/** Popular ideas the app deliberately leaves out. */
export const CAVEATS: Caveat[] = [
  {
    title: 'No love-language types',
    body: 'The idea that everyone has one of five love languages, and that matching makes couples happier, has limited support, and direct tests are mixed. The app doesn’t sort you into types.',
    sources: [R.impettEtAl2024, R.buntHazelwood2017, R.mostovaEtAl2022],
  },
  {
    title: 'No scores or predictions',
    body: 'Claims that researchers can predict divorce with over 90% accuracy come from models fitted and tested on the same small samples. On new couples, accuracy drops sharply. The app gives no compatibility scores and makes no predictions.',
    sources: [R.gottmanLevenson2000, R.buehlmanEtAl1992, R.heymanSlep2001, R.stanleyEtAl2000],
  },
  {
    title: 'No viral statistics',
    body: 'Figures like “happy couples turn toward each other 86% of the time” or “69% of conflicts are perpetual” come from popular books. We couldn’t find them in peer-reviewed papers, so the app doesn’t quote them.',
    sources: [],
  },
];

/** Plain-language notes for each theme. */
export const CATEGORY_RESEARCH: Record<CategoryId, ResearchNote> = {
  'love-maps': {
    strength: 'Emerging',
    summary: 'Happy couples keep a detailed, up-to-date picture of each other\'s world: worries, hopes, friends and history. Knowing each other this well seems to help couples weather big changes like a new baby, and because people keep changing, it\'s worth asking again.',
    sources: [R.gottmanSilver1999, R.shapiroEtAl2000],
  },
  appreciation: {
    strength: 'Moderate',
    summary: 'Noticing and saying what you value in each other matters. People who feel appreciated tend to appreciate their partner back, respond more kindly and stay more committed, and couples who tell their story with fondness are more likely to stay together.',
    sources: [R.algoe2012, R.gordonEtAl2012, R.buehlmanEtAl1992],
  },
  connection: {
    strength: 'Moderate',
    summary: 'Love is built in small moments: a shared joke, a question about someone\'s day, real excitement about good news. Turning toward these everyday bids, especially with enthusiasm, goes with warmer, more affectionate relationships, even during disagreements.',
    sources: [R.driverGottman2004, R.reisEtAl2004, R.gableEtAl2004],
  },
  growth: {
    strength: 'Moderate',
    summary: 'Couples feel closer when they help each other learn, try new things and become who they want to be. Doing something new and a little challenging together gave couples a short-term lift, and being seen as your best self helps you grow toward it.',
    sources: [R.aronAron1986, R.aronEtAl2000, R.drigotasEtAl1999],
  },
  conflict: {
    strength: 'Moderate',
    summary: 'Every couple disagrees, and some disagreements never fully go away. How you talk matters most: criticism, contempt, defensiveness and shutting down are warning signs, while looking at a fight the way a kind, neutral observer would helped keep marriages from sliding.',
    sources: [R.gottmanLevenson1992, R.gottmanSilver1999, R.finkelEtAl2013],
  },
  security: {
    strength: 'Moderate',
    summary: 'Feeling confident that your partner will be there for you is at the heart of adult love. A well-tested couples therapy built on this idea helps partners say what they need to feel safe and close. These prompts borrow that spirit, but they aren\'t therapy.',
    sources: [R.hazanShaver1987, R.wiebeJohnson2016, R.rathgeberEtAl2019],
  },
  trust: {
    strength: 'Strong for commitment, Moderate for trust',
    summary: 'Trust grows when you see your partner choose “us” over “me”: small sacrifices, compromises, showing up. Commitment is stronger when you\'re satisfied, have built a life together and aren\'t looking elsewhere, and committed couples are more likely to last.',
    sources: [R.rusbult1980, R.leAgnew2003, R.wieselquistEtAl1999],
  },
  checkin: {
    strength: 'Moderate',
    summary: 'A regular relationship check-up, noticing what\'s going well and what needs care, helped married couples feel closer, more accepted and less distressed in a rigorous two-year study. Structured online programs can also help couples who are struggling.',
    sources: [R.cordovaEtAl2014, R.dossEtAl2016],
  },
  marriage: {
    strength: 'Moderate',
    summary: 'Commitment has two sides: wanting a future together, and finding it hard to leave. Deciding on big steps together, rather than sliding into them, is thought to build the first kind. Talking through what marriage means to you is the heart of programs that modestly help couples.',
    sources: [R.stanleyMarkman1992, R.stanleyEtAl2006, R.hawkinsEtAl2008],
  },
  kids: {
    strength: 'Strong for the small average decline, Moderate for what protects against it',
    summary: 'On average, relationship satisfaction dips a little after a baby arrives, most of all for new mothers. Couples who stay fond of each other and keep up with each other\'s inner lives tend to weather it best, so it helps to talk about hopes and worries early.',
    sources: [R.twengeEtAl2003, R.dossEtAl2009, R.shapiroEtAl2000],
  },
  home: {
    strength: 'Moderate',
    summary: 'Who does what at home is shaped by time, money and expectations, and feeling that it\'s fair matters more and more, even for couples\' sex lives. Living together before marriage is linked to fewer divorces early in marriage but more later, so moving in deserves a real talk.',
    sources: [R.lachanceGrzelaBouchard2010, R.carlsonEtAl2016, R.rosenfeldRoesler2019],
  },
  money: {
    strength: 'Moderate',
    summary: 'Money arguments aren\'t always the most common, but they tend to be the stickiest: harder to handle, more repetitive and less often resolved. They also predict divorce more than other disagreements. Sharing what money means to you, calmly and early, can help.',
    sources: [R.dewEtAl2012, R.pappEtAl2009],
  },
  origins: {
    strength: 'Moderate',
    summary: 'The families we grew up in shape how we love, argue and commit, but they don\'t decide our fate. Parents\' conflict and divorce can echo in their children\'s relationships, and in-law ties matter too. Sharing family stories helps you understand each other\'s defaults.',
    sources: [R.amatoBooth2001, R.amatoDeBoer2001, R.orbuchEtAl2013],
  },
  dreams: {
    strength: 'Moderate',
    summary: 'Partners who encourage each other\'s goals, cheering on without taking over, help each other feel happier, more confident and more likely to succeed. Supporting each other\'s dreams also goes with a happier relationship. Knowing those dreams is the first step.',
    sources: [R.feeney2004, R.brunsteinEtAl1996],
  },
  meaning: {
    strength: 'Emerging',
    summary: 'Shared rituals and traditions, like a weekly dinner, a holiday custom or the way you say goodnight, are linked with happier marriages. Couples who see their bond as sacred report stronger marriages too. Your own sense of meaning can be religious or not.',
    sources: [R.fieseEtAl2002, R.mahoneyEtAl1999],
  },
  stress: {
    strength: 'Strong evidence of an association',
    summary: 'Stress from work, money or health easily spills into a relationship and makes small things feel bigger. Couples who share their stress and tackle it as a team tend to be more satisfied, so saying “I\'m stressed, here\'s what would help” is worth practicing.',
    sources: [R.bodenmann2005, R.falconierEtAl2015, R.neffKarney2009],
  },
  intimacy: {
    strength: 'Moderate evidence of an association',
    summary: 'Talking openly about sex, including what you enjoy and what you\'d like more of, goes with a better sex life and a happier relationship, and how well you talk matters more than how often. Caring about meeting your partner\'s needs also helps keep desire alive.',
    sources: [R.malloryEtAl2019, R.mallory2022, R.muiseEtAl2013],
  },
};
