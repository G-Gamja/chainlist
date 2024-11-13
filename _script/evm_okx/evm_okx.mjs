import { readFileSync, writeFileSync } from "fs";
import cryptoJS from "crypto-js";

const nativeCoinContractAddress = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

function isEqualsIgnoringCase(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    a.toLowerCase() === b.toLowerCase()
  );
}

async function main() {
  try {
    const apiKey = process.env.OKX_API_KEY;
    const secretKey = process.env.OKX_SECRET_KEY;
    const passphrase = process.env.OKX_PASSPHRASE;
    const coinGeckoApiKey = process.env.COINGECKO_API_KEY;

    const date = new Date();
    const timestamp = date.toISOString();

    const chain = process.argv[2];

    const chainId = process.argv[3];

    if (!chain || !chainId) {
      throw new Error("Missing chain or chainId");
    }

    const fileName = `./chain/${chain}/erc20_2.json`;
    const currentAssets = JSON.parse(readFileSync(fileName, "utf-8"));

    const coinGeckoResponse = await fetch(
      `https://api.coingecko.com/api/v3/coins/list?include_platform=true&status=active`,
      {
        headers: {
          "x-cg-pro-api-key": coinGeckoApiKey,
        },
      }
    );

    const coinGeckoIdsjsonResponse = await coinGeckoResponse.json();

    const coinGeckoIdsKeyMap = {
      ethereum: "ethereum",
      fantom: "fantom",
      polygon: "polygon",
      "binance-smart-chain": "bnb-smart-chain",
    };

    const keyId = coinGeckoIdsKeyMap[chain];

    console.log("🚀 ~ main ~ keyId:", keyId);

    const response = await fetch(
      `https://www.okx.com/api/v5/dex/aggregator/all-tokens?chainId=${chainId}`,
      {
        headers: {
          "OK-ACCESS-KEY": apiKey,
          "OK-ACCESS-SIGN": cryptoJS.enc.Base64.stringify(
            cryptoJS.HmacSHA256(
              timestamp +
                "GET" +
                `/api/v5/dex/aggregator/all-tokens?chainId=${chainId}`,
              secretKey
            )
          ),
          "OK-ACCESS-TIMESTAMP": timestamp,
          "OK-ACCESS-PASSPHRASE": passphrase,
        },
      }
    );

    const jsonResponse = await response.json();

    const erc20Assets = jsonResponse.data;

    const currentAssetContractAddresses = currentAssets.map((asset) => {
      return asset.contract.toLowerCase();
    });

    const 필터링된코인게코리스폰스 = coinGeckoIdsjsonResponse.filter(
      (item) => !!item.platforms[keyId]
    );

    console.log(
      "🚀 ~ main ~ 필터링된코인게코리스폰스:",
      필터링된코인게코리스폰스
    );

    const assetsToAdd = erc20Assets
      .filter((asset) => {
        return (
          !currentAssetContractAddresses.includes(
            asset.tokenContractAddress.toLowerCase()
          ) &&
          asset.tokenContractAddress.toLowerCase() !==
            nativeCoinContractAddress.toLowerCase()
        );
      })
      .map((asset) => {
        const coinGeckoId =
          필터링된코인게코리스폰스.find((item) => {
            return isEqualsIgnoringCase(
              item.platforms[keyId],
              asset.tokenContractAddress
            );
          })?.id || "";

        return {
          type: "erc20",
          contract: asset.tokenContractAddress,
          name: asset.tokenName,
          symbol: asset.tokenSymbol,
          description: asset.tokenSymbol, // NOTE: Temporary
          decimals:
            typeof asset.decimals === "string"
              ? Number(asset.decimals)
              : asset.decimals,
          image: asset?.tokenLogoUrl,
          coinGeckoId: asset?.coingeckoId || coinGeckoId || "",
        };
      });

    const mergedAssets = [...currentAssets, ...assetsToAdd];

    writeFileSync(fileName, JSON.stringify(mergedAssets, null, 2));

    console.log("Assets added successfully");
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
}

main();
