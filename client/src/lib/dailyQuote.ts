const QUOTES = [
  "A excelência não é um ato, mas um hábito. Pequenas melhorias diárias geram grandes resultados.",
  "Times que se comunicam bem entregam mais rápido e com menos retrabalho.",
  "Cada tarefa concluída hoje é um passo a menos para o objetivo de amanhã.",
  "Organização não é sobre fazer mais coisas, é sobre fazer as coisas certas.",
  "Um problema bem definido já está parcialmente resolvido.",
  "Qualidade é lembrada muito depois que o preço foi esquecido.",
  "O trabalho em equipe transforma metas individuais em conquistas coletivas.",
  "Disciplina é escolher entre o que você quer agora e o que você quer mais.",
  "Pequenos progressos diários levam a grandes resultados ao longo do tempo.",
  "A clareza na comunicação evita 90% dos problemas em qualquer projeto.",
  "Foco é dizer não para boas ideias, para dar espaço às ideias certas.",
  "Quem cuida dos detalhes constrói uma reputação de confiança.",
  "Planejamento sem ação é só teoria; ação sem planejamento é caos.",
  "O cliente nota o cuidado que você não viu necessidade de mostrar.",
  "Resolver problemas é mais valioso do que apenas identificar erros.",
  "Hoje é uma boa oportunidade para fazer algo um pouco melhor que ontem.",
  "Prazos são compromissos: cumpri-los é construir confiança.",
  "A melhor forma de prever o resultado é cuidar do processo.",
  "Trabalho bem feito não precisa de desculpas.",
  "Toda entrega de qualidade começa com uma pergunta bem feita.",
  "Consistência vence intensidade no longo prazo.",
  "Ajudar um colega hoje também acelera o seu próprio trabalho.",
  "A produtividade real está em terminar o que importa, não em fazer de tudo.",
  "Um bom dia de trabalho começa com prioridades claras.",
  "Erros são informação; o que importa é o que se faz com eles depois.",
  "Compromisso com o prazo é tão importante quanto compromisso com a qualidade.",
  "Cuidar do cliente interno é o primeiro passo para cuidar bem do cliente externo.",
  "A diferença entre bom e ótimo está nos detalhes que poucos se importam em revisar.",
  "Comece pelo que é mais importante, não pelo que é mais fácil.",
  "Cada entrega é uma oportunidade de reforçar a confiança da equipe em você.",
];

function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function getDailyQuote(): string {
  const index = dayOfYear(new Date()) % QUOTES.length;
  return QUOTES[index];
}
