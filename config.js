/*
 * CONFIGURAÇÃO DO PAINEL — edite só este arquivo.
 *
 * apps:   "busca" é o trecho do nome do app na TV (sem maiúsculas/minúsculas).
 *         "ids" são IDs conhecidos do app na Samsung, tentados primeiro.
 * canais: "numero" é o número que você digitaria no controle (ex.: "4" ou "4.1").
 *         Confira os números na sua TV: Menu > Canais > Lista de canais.
 */
var CONFIG = {
  nome: 'Cleber',

  // Imagens de fundo (pasta app/img), alternando em loop.
  // Use JPG 1920x1080 de até ~400 KB para não pesar na TV.
  fundos: ['img/fundo1.jpg', 'img/fundo2.jpg'],
  intervaloFundo: 12,   // segundos em cada imagem

  // Previsão do tempo (Open-Meteo, gratuito, sem cadastro). Atualiza a cada 30 min.
  tempo: {
    cidade: 'N. Sra. do Socorro',
    latitude: -10.855,
    longitude: -37.12611,
    fuso: 'America/Maceio'
  },

  apps: [
    { nome: 'Globoplay',   busca: 'globoplay', ids: [] },
    { nome: 'YouTube',     busca: 'youtube',   ids: ['com.samsung.tv.cobalt-yt', '111299001912', '9Ur5IzDKqV.TizenYouTube'] },
    { nome: 'Netflix',     busca: 'netflix',   ids: ['org.tizen.netflix-app', '3201907018807'] },
    { nome: 'Prime Video', busca: 'prime',     ids: ['org.tizen.primevideo', '3201910019365'] }
  ],

  // Numeração de Aracaju (fonte: Minha Operadora, fev/2026). Ajuste se precisar.
  canais: [
    { numero: '4',  nome: 'Globo' },
    { numero: '8',  nome: 'Record' },
    { numero: '50', nome: 'SBT' },
    { numero: '44', nome: 'Band' },
    { numero: '6',  nome: 'Cultura' }
  ]
};
