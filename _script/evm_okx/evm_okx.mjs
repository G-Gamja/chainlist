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

    const coingeckoActiveCoinsData = await fetch(
      `https://api.coingecko.com/api/v3/coins/list?include_platform=true&status=active`,
      {
        headers: {
          "x-cg-pro-api-key": coinGeckoApiKey,
        },
      }
    );

    const activeGeckoCoinsDataResponse = await coingeckoActiveCoinsData.json();

    const pageList = [1, 2, 3, 4];
    const top1000CoinGeckoIds = (
      await Promise.all(
        pageList.map(async (pageIndex) => {
          try {
            const response = await fetch(
              `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&page=${pageIndex}`,
              {
                headers: {
                  "x-cg-pro-api-key": coinGeckoApiKey,
                },
              }
            );

            const result = await response.json();

            return result?.map((item) => item.id) || [];
          } catch (e) {
            return [];
          }
        })
      )
    ).flat();

    console.log("Intentionally waiting for 31 seconds for avoiding rate limit");
    const fetchAssetPlatformsData = () => {
      return new Promise((resolve) => {
        setTimeout(async () => {
          const assetPlatformsResponse = await fetch(
            `https://api.coingecko.com/api/v3/asset_platforms`,
            {
              headers: {
                "x-cg-pro-api-key": coinGeckoApiKey,
              },
            }
          );

          const assetPlatformsResponseData =
            await assetPlatformsResponse.json();

          resolve(assetPlatformsResponseData);
        }, 31000);
      });
    };

    const assetPlatformsData = await fetchAssetPlatformsData();

    // NOTE chain_identifier only supports EVM chainids
    const assetPlatformId = assetPlatformsData.find(
      (item) => String(item.chain_identifier) === String(chainId)
    ).id;

    const filteredCoinGeckoIdsByChain = activeGeckoCoinsDataResponse.filter(
      (item) => !!item.platforms[assetPlatformId]
    );

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
          filteredCoinGeckoIdsByChain.find(
            (item) =>
              isEqualsIgnoringCase(
                item.platforms[assetPlatformId],
                asset.tokenContractAddress
              ) && top1000CoinGeckoIds.includes(item.id)
          )?.id || "";

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
          coinGeckoId: coinGeckoId || "",
        };
      });

    const newCoinGeckoIds = assetsToAdd
      .filter((item) => !!item.coinGeckoId)
      .map((item) => item.coinGeckoId);

    console.log("Coin ID List for comparison");
    console.log("🚀 ~ newCoinGeckoIds:", JSON.stringify(newCoinGeckoIds));

    // const response = await fetch('https://front.api.mintscan.io/v10/utils/market/register', {
    //   method: 'POST', // HTTP 메서드를 POST로 설정
    //   headers: {
    //     'x-authorization': 'dmsxhlgkrhtlvek!', // 요청 헤더 설정
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({ coingecko_id: newCoinGeckoIds }), // 요청 본문 설정
    // });
    // const data = await response.json();

    const mergedAssets = [...currentAssets, ...assetsToAdd];

    writeFileSync(fileName, JSON.stringify(mergedAssets, null, 2));

    console.log("Assets added successfully");
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
}

main();
